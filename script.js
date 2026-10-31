/* =========================================================
   TASKOUFLAGE — AUTHENTICATION + AWS CONNECTION
   PART 1 OF 3
========================================================= */

(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const API_URL =
    "https://imzlg40su5.execute-api.ap-southeast-2.amazonaws.com";

  // Temporary shared partition: this restores the existing DynamoDB tasks.
  const TASK_USER_ID = "USER001";

  const COGNITO_DOMAIN =
    "https://ap-southeast-2utrnjs1tr.auth.ap-southeast-2.amazoncognito.com";

  const COGNITO_CLIENT_ID = "7na0ha73qiifeomdmamhrf76o4";
  const COGNITO_REDIRECT_URI = "http://127.0.0.1:5501/";

  const KEYS = {
    focus: "taskouflage_focus_minutes_v1"
  };

  let tasks = [];
  let currentUser = null;
  let timerInterval = null;
  let secondsRemaining = 25 * 60;
  let focusRunning = false;
  let focusMinutes = Number(localStorage.getItem(KEYS.focus) || 0);

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function showView(view) {
    ["landing", "authSection", "dashboard", "adminDashboard"].forEach((id) => {
      const element = $("#" + id);
      if (element) {
        element.classList.toggle("hidden", id !== view);
      }
    });

    $("#mainHeader")?.classList.toggle(
      "hidden",
      view === "dashboard" || view === "adminDashboard"
    );

    $("#mainFooter")?.classList.toggle(
      "hidden",
      view === "dashboard" || view === "adminDashboard"
    );

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function save() {
    localStorage.setItem(KEYS.focus, String(focusMinutes));
  }

  /* ================= COGNITO LOGIN ================= */

  function cognitoLogin() {
    const url = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);

    url.searchParams.set("client_id", COGNITO_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email");
    url.searchParams.set("redirect_uri", COGNITO_REDIRECT_URI);
    url.searchParams.set("prompt", "login");

    window.location.assign(url.toString());
  }

  function decodeJwtPayload(token) {
    const parts = token.split(".");

    if (parts.length !== 3) {
      throw new Error("Invalid Cognito ID token.");
    }

    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);

    return JSON.parse(
      decodeURIComponent(
        Array.from(atob(padded), (ch) =>
          "%" + ch.charCodeAt(0).toString(16).padStart(2, "0")
        ).join("")
      )
    );
  }

  /* ================= COGNITO CALLBACK ================= */

  async function completeCognitoLogin() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthError = params.get("error");

    if (oauthError) {
      throw new Error(
        params.get("error_description") || oauthError
      );
    }

    if (!code) return false;

    const response = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: COGNITO_CLIENT_ID,
        code,
        redirect_uri: COGNITO_REDIRECT_URI
      })
    });

    const tokens = await response.json();

    if (!response.ok) {
      throw new Error(
        tokens.error_description ||
        tokens.error ||
        `Cognito token error: ${response.status}`
      );
    }

    if (!tokens.id_token) {
      throw new Error("Cognito did not return an ID token.");
    }

    const profile = decodeJwtPayload(tokens.id_token);

    if (!profile.sub || !profile.email) {
      throw new Error(
        "Cognito did not return the required user ID and email."
      );
    }

    sessionStorage.setItem("cognito_id_token", tokens.id_token);

    if (tokens.access_token) {
      sessionStorage.setItem("cognito_access_token", tokens.access_token);
    }

    if (tokens.refresh_token) {
      sessionStorage.setItem("cognito_refresh_token", tokens.refresh_token);
    }

    // Remove the temporary authorization code from the URL.
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );

    return profile;
  }

  /* ================= AUTHENTICATED USER ================= */

  function setAuthenticatedUser(profile) {
  const email = String(profile.email || "").trim().toLowerCase();

  if (!email || !profile.sub) {
    throw new Error("Invalid Cognito user profile.");
  }

  const name =
    profile.name ||
    profile.given_name ||
    email.split("@")[0];

  const isAdmin =
    Array.isArray(profile["cognito:groups"]) &&
    profile["cognito:groups"].includes("Admin");

  currentUser = {
    name,
    email,
    role: isAdmin ? "admin" : "user",
    cognitoSub: profile.sub,
    authProvider: "Cognito"
  };

  sessionStorage.setItem(
    "taskouflage_authenticated_user",
    JSON.stringify(currentUser)
  );

  if ($("#sidebarUser")) {
    $("#sidebarUser").textContent = name;
  }

  if ($("#sidebarAvatar")) {
    $("#sidebarAvatar").textContent = name.charAt(0).toUpperCase();
  }

  if ($("#topAvatar")) {
    $("#topAvatar").textContent = name.charAt(0).toUpperCase();
  }
}

  /* ================= LOGOUT ================= */

  function logout() {
    stopTimer();

    currentUser = null;
    tasks = [];

    sessionStorage.removeItem("cognito_id_token");
    sessionStorage.removeItem("cognito_access_token");
    sessionStorage.removeItem("cognito_refresh_token");
    sessionStorage.removeItem("taskouflage_authenticated_user");

    const url = new URL(`${COGNITO_DOMAIN}/logout`);

    url.searchParams.set("client_id", COGNITO_CLIENT_ID);
    url.searchParams.set("logout_uri", COGNITO_REDIRECT_URI);

    window.location.assign(url.toString());
  }

  /* ================= AWS API REQUEST ================= */

  async function awsRequest(path, method = "GET", data = null) {
    const token = sessionStorage.getItem("cognito_id_token");

    if (!token) {
      throw new Error("You must sign in before accessing tasks.");
    }

    const options = {
      method,
      headers: {
        "Authorization": `Bearer ${token}`
      }
    };

    if (data !== null) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${API_URL}${path}`, options);
    const responseText = await response.text();

    let result = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(
        `Invalid AWS response (${response.status}): ${responseText}`
      );
    }

    if (!response.ok) {
      throw new Error(
        result.error ||
        result.message ||
        `AWS request failed: ${response.status}`
      );
    }

    if (typeof result.body === "string") {
      try {
        return JSON.parse(result.body);
      } catch {
        throw new Error("Unable to parse AWS response body.");
      }
    }

    return result;
  }

  /* ================= LOAD TASKS ================= */

  async function loadTasks() {
    if (!currentUser || currentUser.role !== "user") {
      return false;
    }

    try {
      const result = await awsRequest(
        `/tasks?userId=${encodeURIComponent(TASK_USER_ID)}`,
        "GET"
      );

      tasks = (result.tasks || []).map((task) => ({
        id: task.recordId,
        title: task.title,
        priority: task.priority || "Normal",
        completed: task.status === "COMPLETED",
        owner: currentUser.email,
        createdAt: task.createdAt
      }));

      return true;

    } catch (error) {
      console.error("AWS task loading failed:", error);
      alert("Could not load AWS tasks: " + error.message);
      return false;
    }
  }

  function userTasks() {
    if (!currentUser) return [];

    return tasks.filter(
      (task) => task.owner === currentUser.email
    );
  }

  /* ================= CREATE TASK ================= */

  async function addTask(title, priority) {
    const cleanTitle = title.trim();

    if (!cleanTitle || !currentUser) return;

    try {
      await awsRequest("/tasks", "POST", {
        userId: TASK_USER_ID,
        title: cleanTitle,
        priority
      });

      await loadTasks();
      showUserPage("tasks");

    } catch (error) {
      console.error("Task creation failed:", error);
      alert("Could not create task: " + error.message);
    }
  }
    /* ================= UPDATE TASK ================= */

  async function toggleTask(id) {
    const task = tasks.find(
      (item) => item.id === id && item.owner === currentUser?.email
    );

    if (!task) return;

    try {
      await awsRequest("/tasks", "PUT", {
        userId: TASK_USER_ID,
        recordId: id,
        status: task.completed ? "PENDING" : "COMPLETED"
      });

      await loadTasks();
      showUserPage("tasks");

    } catch (error) {
      console.error("Task update failed:", error);
      alert("Could not update task: " + error.message);
    }
  }

  /* ================= DELETE TASK ================= */

  async function deleteTask(id) {
    if (!currentUser) return;
    if (!confirm("Delete this task permanently?")) return;

    try {
      await awsRequest(
        `/tasks?userId=${encodeURIComponent(TASK_USER_ID)}&recordId=${encodeURIComponent(id)}`,
        "DELETE"
      );

      await loadTasks();
      showUserPage("tasks");

    } catch (error) {
      console.error("Task deletion failed:", error);
      alert("Could not delete task: " + error.message);
    }
  }

  /* ================= END PART 1 ================= */
  /* ================= USER DASHBOARD ================= */

  function showUserPage(page) {
    if (!currentUser) return;

    const pages = {
      home: "Mission Control",
      tasks: "My Tasks",
      focus: "Focus Mode",
      analytics: "Analytics",
      report: "Reality Report",
      profile: "My Profile"
    };

    $("#dashboardHeading").textContent = pages[page] || pages.home;

    $$(".nav-item[data-page]").forEach((button) => {
      button.classList.toggle("active", button.dataset.page === page);
    });

    const mine = userTasks();
    const total = mine.length;
    const completed = mine.filter((task) => task.completed).length;
    const pending = total - completed;
    const score = total ? Math.round((completed / total) * 100) : 0;

    if (page === "home") {
      $("#content").innerHTML = `
        <div class="welcome-row">
          <div>
            <span class="eyebrow">MISSION BRIEFING</span>
            <h2>Welcome back, ${escapeHTML(currentUser.name)}.</h2>
            <p>Your next achievement is hiding behind one completed task.</p>
          </div>
          <span class="status-pill">● READY FOR ACTION</span>
        </div>

        <div class="stat-grid">
          <article class="stat-card">
            <span class="stat-icon">📋</span>
            <small>TOTAL TASKS</small>
            <strong>${total}</strong>
            <p>Every mission starts somewhere</p>
          </article>

          <article class="stat-card">
            <span class="stat-icon">✅</span>
            <small>COMPLETED</small>
            <strong>${completed}</strong>
            <p>Look at you, getting things done</p>
          </article>

          <article class="stat-card">
            <span class="stat-icon">⏳</span>
            <small>PENDING</small>
            <strong>${pending}</strong>
            <p>They are still waiting. Politely.</p>
          </article>

          <article class="stat-card">
            <span class="stat-icon">⚡</span>
            <small>FOCUS MINUTES</small>
            <strong>${focusMinutes}</strong>
            <p>Time spent in focus sessions</p>
          </article>
        </div>

        <div class="content-grid">
          <article class="panel">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">YOUR PROGRESS</span>
                <h3>Mission completion</h3>
              </div>
              <strong class="highlight-number">${score}%</strong>
            </div>

            <div class="progress-track large">
              <div class="progress-fill" style="width:${score}%"></div>
            </div>

            <p>
              ${total
                ? `${completed} of ${total} missions completed.`
                : "Add your first task to start tracking progress."}
            </p>
          </article>

          <article class="panel quote-panel">
            <span class="eyebrow">DAILY REMINDER</span>
            <h3>"Consistency is just procrastination in reverse."</h3>
            <p>One small step. Then another. Pretend it was the plan all along.</p>
            <button class="primary-btn" data-go="tasks">View My Tasks ↗</button>
          </article>
        </div>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <span class="eyebrow">UP NEXT</span>
              <h3>Pending missions</h3>
            </div>
            <button class="small-btn" data-go="tasks">View all</button>
          </div>
          ${renderTaskList(mine.filter(task => !task.completed).slice(0, 4), false)}
        </article>
      `;

    } else if (page === "tasks") {
      $("#content").innerHTML = `
        <div class="page-intro">
          <span class="eyebrow">TASK MANAGEMENT</span>
          <h2>Make a plan. Become a legend.</h2>
          <p>Add tasks, mark missions complete and keep the chaos organised.</p>
        </div>

        <form id="addTaskForm" class="task-form">
          <input
            id="newTask"
            type="text"
            maxlength="120"
            placeholder="What needs to get done?"
            required
          >

          <select id="taskPriority">
            <option value="Normal">Normal priority</option>
            <option value="High">High priority</option>
            <option value="Low">Low priority</option>
          </select>

          <button class="primary-btn" type="submit">+ Add Task</button>
        </form>

        <div class="task-filter-row">
          <span>${total} total missions · ${completed} completed</span>
          <span class="eyebrow">YOUR TASK LIST</span>
        </div>

        ${renderTaskList(mine, true)}
      `;

      $("#addTaskForm").addEventListener("submit", async (event) => {
        event.preventDefault();

        const button = $("#addTaskForm button[type='submit']");
        const title = $("#newTask").value;
        const priority = $("#taskPriority").value;

        button.disabled = true;
        button.textContent = "Saving...";

        await addTask(title, priority);

        if (button.isConnected) {
          button.disabled = false;
          button.textContent = "+ Add Task";
        }
      });

      $$(".task-toggle").forEach((button) => {
        button.addEventListener("click", () => toggleTask(button.dataset.id));
      });

      $$(".task-delete").forEach((button) => {
        button.addEventListener("click", () => deleteTask(button.dataset.id));
      });

    } else if (page === "focus") {
      $("#content").innerHTML = `
        <div class="page-intro">
          <span class="eyebrow">DEEP WORK PROTOCOL</span>
          <h2>Focus. No excuses. Mostly.</h2>
          <p>A 25-minute focus session. Your notifications can survive without you.</p>
        </div>

        <article class="timer-panel ${focusRunning ? "focus-active" : ""}">
          <span class="eyebrow">CURRENT SESSION</span>
          <div class="timer" id="timerDisplay">${formatTime(secondsRemaining)}</div>
          <p id="timerStatus">
            ${focusRunning
              ? "Focus session in progress. Stay on target."
              : "Ready when you are."}
          </p>

          <div class="timer-actions">
            <button class="primary-btn" id="timerStart">
              ${focusRunning ? "Pause Session" : "Start Focus"}
            </button>
            <button class="secondary-btn" id="timerReset">Reset 25:00</button>
          </div>

          <p class="timer-note">Completed focus sessions add 25 minutes to your total.</p>
        </article>
      `;

      $("#timerStart").addEventListener("click", () => {
        focusRunning ? pauseTimer() : startTimer();
      });

      $("#timerReset").addEventListener("click", resetTimer);

    } else if (page === "analytics") {
      $("#content").innerHTML = `
        <div class="page-intro">
          <span class="eyebrow">PERFORMANCE INTELLIGENCE</span>
          <h2>Numbers don't lie. Usually.</h2>
          <p>A quick snapshot of your productivity performance.</p>
        </div>

        <div class="stat-grid">
          <article class="stat-card">
            <small>COMPLETION RATE</small>
            <strong>${score}%</strong>
            <p>Tasks completed / total tasks</p>
          </article>

          <article class="stat-card">
            <small>TOTAL TASKS</small>
            <strong>${total}</strong>
            <p>All your saved missions</p>
          </article>

          <article class="stat-card">
            <small>FOCUS TIME</small>
            <strong>${focusMinutes}</strong>
            <p>Minutes recorded</p>
          </article>
        </div>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <span class="eyebrow">TASK BREAKDOWN</span>
              <h3>Completed vs pending</h3>
            </div>
          </div>

          <div class="bar-chart">
            <div class="bar-item">
              <div class="bar-track">
                <div class="bar-fill" style="height:${total ? completed / total * 100 : 0}%"></div>
              </div>
              <b>${completed}</b>
              <span>Completed</span>
            </div>

            <div class="bar-item">
              <div class="bar-track">
                <div class="bar-fill lavender-fill" style="height:${total ? pending / total * 100 : 0}%"></div>
              </div>
              <b>${pending}</b>
              <span>Pending</span>
            </div>
          </div>
        </article>
      `;

    } else if (page === "report") {
      const line = score >= 75
        ? "You're doing suspiciously well. We may need to investigate."
        : score >= 40
          ? "Some progress is happening. Let's not get carried away."
          : "Your task list is giving 'I'll do it tomorrow' energy.";

      $("#content").innerHTML = `
        <div class="page-intro">
          <span class="eyebrow">THE HONEST DEPARTMENT</span>
          <h2>Your Reality Report</h2>
          <p>A little honesty, served with a side of sarcasm.</p>
        </div>

        <article class="report-panel">
          <span class="report-stamp">CONFIDENTIAL · PROBABLY</span>
          <h3>${escapeHTML(line)}</h3>

          <div class="report-metrics">
            <div><strong>${score}%</strong><span>Completion score</span></div>
            <div><strong>${pending}</strong><span>Unfinished missions</span></div>
            <div><strong>${focusMinutes}</strong><span>Focus minutes</span></div>
          </div>

          <p>
            ${total
              ? `You have completed ${completed} out of ${total} tasks. `
              : "You have not added any tasks yet. "}
            Your next move is obvious. We believe in you. Cautiously.
          </p>
        </article>
      `;

    } else if (page === "profile") {
      $("#content").innerHTML = `
        <div class="page-intro">
          <span class="eyebrow">ACCOUNT SETTINGS</span>
          <h2>My Profile</h2>
          <p>Your identity within the department.</p>
        </div>

        <article class="panel profile-panel">
          <div class="profile-avatar">
            ${escapeHTML(currentUser.name.charAt(0).toUpperCase())}
              /* ================= PROFILE DISPLAY ================= */

          </div>

          <h3>${escapeHTML(currentUser.name)}</h3>
          <p>${escapeHTML(currentUser.email)}</p>
          <span class="status-pill">USER ACCOUNT</span>

          <p class="profile-warning">
            Authenticated using Amazon Cognito.
          </p>
        </article>
      `;
    }

    $$("#content [data-go]").forEach((button) => {
      button.addEventListener("click", () => showUserPage(button.dataset.go));
    });
  }

  /* ================= TASK LIST DISPLAY ================= */

  function renderTaskList(list, showActions) {
    if (!list.length) {
      return `
        <div class="empty-state">
          <span>🗂️</span>
          <h3>No missions here.</h3>
          <p>
            ${showActions
              ? "Add a task above and make today count."
              : "Your next task is waiting to be created."}
          </p>
        </div>
      `;
    }

    return `
      <div class="task-list">
        ${list.map((task) => `
          <div class="task-row ${task.completed ? "completed" : ""}">
            <div class="task-check">${task.completed ? "✓" : "○"}</div>

            <div class="task-copy">
              <strong>${escapeHTML(task.title)}</strong>
              <span class="priority priority-${String(task.priority).toLowerCase()}">
                ${escapeHTML(task.priority)} priority
              </span>
            </div>

            ${showActions
              ? `
                <div class="task-actions">
                  <button class="small-btn task-toggle" data-id="${escapeHTML(task.id)}">
                    ${task.completed ? "Undo" : "Complete"}
                  </button>
                  <button class="icon-btn task-delete" data-id="${escapeHTML(task.id)}" aria-label="Delete task">✕</button>
                </div>
              `
              : `
                <span class="task-state">
                  ${task.completed ? "DONE" : "IN PROGRESS"}
                </span>
              `}
          </div>
        `).join("")}
      </div>
    `;
  }

  /* ================= FOCUS TIMER ================= */

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  function updateTimerDisplay() {
    const display = $("#timerDisplay");
    if (display) display.textContent = formatTime(secondsRemaining);
  }

  function startTimer() {
    if (timerInterval) return;

    focusRunning = true;
    showUserPage("focus");

    timerInterval = setInterval(() => {
      secondsRemaining--;
      updateTimerDisplay();

      if (secondsRemaining <= 0) {
        stopTimer();
        focusMinutes += 25;
        save();
        secondsRemaining = 25 * 60;

        alert("Focus session complete! 25 minutes added. Take a short break.");
        showUserPage("focus");
      }
    }, 1000);
  }

  function pauseTimer() {
    stopTimer();
    showUserPage("focus");
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = null;
    focusRunning = false;
  }

  function resetTimer() {
    stopTimer();
    secondsRemaining = 25 * 60;
    showUserPage("focus");
  }

  /* ================= ADMIN DASHBOARD ================= */

  
async function showAdminPage(page) {
  const titles = {
    overview: "Admin Overview",
    users: "User Management",
    platform: "Platform Analytics"
  };

  $("#adminHeading").textContent = titles[page] || titles.overview;

  $$("[data-admin-page]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminPage === page);
  });

  const content = $("#adminContent");

  content.innerHTML = `
    <div class="page-intro">
      <span class="eyebrow">LOADING ADMIN DATA</span>
      <h2>Please wait...</h2>
    </div>
  `;

  try {
    const [stats, userData, taskData] = await Promise.all([
      awsRequest("/admin/stats"),
      awsRequest("/admin/users"),
      awsRequest("/admin/tasks")
    ]);

    const users = userData.users || [];
    const tasks = taskData.tasks || [];

    const statCard = (label, value) => `
      <article class="panel">
        <span class="eyebrow">${label}</span>
        <h2>${Number(value) || 0}</h2>
      </article>
    `;

    if (page === "overview") {
      content.innerHTML = `
        <div class="page-intro">
          <span class="eyebrow">SYSTEM SNAPSHOT</span>
          <h2>Platform command centre</h2>
          <p>Live information from AWS.</p>
        </div>

        <div class="stats-grid">
          ${statCard("TOTAL USERS", stats.totalUsers)}
          ${statCard("TOTAL TASKS", stats.totalTasks)}
          ${statCard("COMPLETED TASKS", stats.completedTasks)}
          ${statCard("PENDING TASKS", stats.pendingTasks)}
          ${statCard("HIGH PRIORITY TASKS", stats.highPriorityTasks)}
        </div>

        <article class="panel">
          <h3>System status</h3>
          <p>Admin data successfully loaded from AWS.</p>
          <p>Registered users: ${users.length}</p>
          <p>Platform tasks: ${tasks.length}</p>
        </article>
      `;

    } else if (page === "users") {
      content.innerHTML = `
        <div class="page-intro">
          <span class="eyebrow">ACCOUNT DIRECTORY</span>
          <h2>User management</h2>
          <p>Total registered accounts: ${users.length}</p>
        </div>

        <article class="panel">
          <div style="overflow-x:auto">
            <table style="width:100%; text-align:left">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(user => `
                  <tr>
                    <td>${escapeHTML(user.username || "-")}</td>
                    <td>${escapeHTML(user.email || "-")}</td>
                    <td>${escapeHTML(user.status || "-")}</td>
                    <td>${user.enabled ? "Yes" : "No"}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </article>
      `;

    } else {
      content.innerHTML = `
        <div class="page-intro">
          <span class="eyebrow">PLATFORM PERFORMANCE</span>
          <h2>Platform analytics</h2>
          <p>Live task statistics from AWS.</p>
        </div>

        <div class="stats-grid">
          ${statCard("TOTAL TASKS", stats.totalTasks)}
          ${statCard("COMPLETED", stats.completedTasks)}
          ${statCard("PENDING", stats.pendingTasks)}
          ${statCard("HIGH PRIORITY", stats.highPriorityTasks)}
        </div>

        <article class="panel">
          <h3>Task status breakdown</h3>
          <p>Completed: ${stats.completedTasks}</p>
          <p>Pending: ${stats.pendingTasks}</p>
          <p>High priority: ${stats.highPriorityTasks}</p>
        </article>
      `;
    }

  } catch (error) {
    console.error("Admin dashboard error:", error);

    content.innerHTML = `
      <article class="panel">
        <h3>Unable to load admin data</h3>
        <p>${escapeHTML(error.message)}</p>
        <button class="secondary-btn" id="retryAdmin">
          Retry
        </button>
      </article>
    `;

    $("#retryAdmin")?.addEventListener("click", () => {
      showAdminPage(page);
    });
  }
}

  /* ================= END PART 2 ================= */

  /* ================= LOGIN BUTTONS ================= */

  $("#headerLogin")?.addEventListener("click", (event) => {
    event.preventDefault();
    cognitoLogin();
  });

  $("#heroLogin")?.addEventListener("click", (event) => {
    event.preventDefault();
    cognitoLogin();
  });

  $("#demoLogin")?.addEventListener("click", (event) => {
    event.preventDefault();

    alert(
      "Demo Login is disabled. Please use Sign In with your Cognito account."
    );
  });

  $("#loginForm")?.addEventListener("submit", (event) => {
    event.preventDefault();

    alert(
      "Please use the Amazon Cognito Sign In button to access your account."
    );
  });

  /* ================= SIGN OUT BUTTONS ================= */

  $("#logoutBtn")?.addEventListener("click", logout);
  $("#sidebarLogout")?.addEventListener("click", logout);

  /* ================= NAVIGATION ================= */

  $$(".nav-item[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      showUserPage(button.dataset.page);
    });
  });

  $$("[data-admin-page]").forEach((button) => {
    button.addEventListener("click", () => {
      showAdminPage(button.dataset.adminPage);
    });
  });

  $$("[data-go]").forEach((button) => {
    button.addEventListener("click", () => {
      showUserPage(button.dataset.go);
    });
  });

  /* ================= OTHER PAGE BUTTONS ================= */

  $("#getStarted")?.addEventListener("click", cognitoLogin);
  $("#startNow")?.addEventListener("click", cognitoLogin);

  $("#backHome")?.addEventListener("click", () => {
    showView("landing");
  });

  /* ================= APPLICATION STARTUP ================= */

async function startApplication() {
  showView("landing");

  try {
    const profile = await completeCognitoLogin();

    if (!profile) {
      // Do not automatically restore an old browser-only demo account.
      return;
    }

    // Set authenticated user details and detect account role.
    setAuthenticatedUser(profile);

    // ADMIN LOGIN
    if (currentUser.role === "admin") {
      showView("adminDashboard");
      showAdminPage("overview");
      return;
    }

    // NORMAL USER LOGIN
    showView("dashboard");

    if ($("#content")) {
      $("#content").innerHTML = `
        <div class="panel">
          <h3>Welcome, ${escapeHTML(currentUser.name)}!</h3>
          <p>Authenticated through Amazon Cognito.</p>
          <p>Loading your tasks...</p>
        </div>
      `;
    }

    const loaded = await loadTasks();

    if (loaded) {
      showUserPage("home");
    } else {
      $("#content").innerHTML = `
        <div class="panel">
          <h3>Authentication successful</h3>
          <p>Your Cognito account is connected.</p>
          <p>However, the task API needs attention.</p>
          <button class="secondary-btn" id="retryTasks">
            Retry loading tasks
          </button>
        </div>
      `;

      $("#retryTasks")?.addEventListener("click", async () => {
        await loadTasks();
        showUserPage("home");
      });
    }

  } catch (error) {
    console.error("Taskouflage startup error:", error);

    showView("landing");

    alert(
      "Unable to complete sign-in: " + error.message
    );
  }
}

  /* ================= GLOBAL ERROR HANDLING ================= */

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Taskouflage error:", event.reason);
  });

  /* ================= START ================= */

  startApplication();

  console.log("Taskouflage initialized.");
  console.log("AWS API:", API_URL);
  console.log("Cognito authentication enabled.");
})();