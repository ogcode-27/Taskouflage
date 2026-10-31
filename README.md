# 🎭 Taskouflage – Mission: Look Busy

### Productivity, with a personality.

Taskouflage is a web-based task management and productivity platform designed to help users organize their daily activities, manage tasks, track focus sessions, and understand their productivity through analytics.

The platform provides a user dashboard and an administrator dashboard with a modern, responsive interface.

---

## 🚀 Project Overview

Taskouflage combines task management, focus tracking, productivity analytics, and administrative monitoring in one platform.

It provides users with tools to manage their daily work while giving administrators an overview of platform activity.

## ✨ Key Features

### 👤 User Dashboard
- **Overview:** View a summary of tasks and productivity.
- **My Tasks:** Create, manage, update, and delete tasks.
- **Focus Mode:** Use a 25-minute focus timer.
- **Analytics:** View task and productivity statistics.
- **Reality Report:** Review productivity-related information.
- **My Profile:** Access user profile information.

### 🛡️ Admin Dashboard
- Admin overview and platform statistics.
- User management and user information.
- Platform-wide task monitoring.
- Administrative access control.

### 🔐 Authentication
- Secure user authentication using Amazon Cognito.
- Login and logout functionality.
- Role-based administrator access.

---

## 🛠️ Technologies Used

| Technology | Purpose |
|---|---|
| HTML5 | Website structure |
| CSS3 | Styling and responsive design |
| JavaScript | Frontend functionality |
| Amazon Cognito | User authentication |
| Amazon API Gateway | Backend API access |
| AWS Lambda | Serverless backend processing |
| Amazon DynamoDB | Data storage |
| AWS Amplify | Frontend hosting |
| Git & GitHub | Version control and collaboration |

---

## ☁️ AWS Architecture

Taskouflage uses AWS serverless services to support authentication, backend processing, data storage, and web hosting.

**Application workflow:**

```text
          USER
            |
            v
     TASKOUFLAGE WEBSITE
            |
            v
      AMAZON COGNITO
       Authentication
            |
            v
      AMAZON API GATEWAY
            |
            v
        AWS LAMBDA
      Backend Processing
            |
            v
       AMAZON DYNAMODB
        Data Storage
```

**Hosting:** AWS Amplify hosts the frontend application.

---

## 📂 Project Structure

```text
Taskouflage/
│
├── index.html
├── style.css
├── script.js
├── README.md
│
└── .vscode/
```

---

## ⚙️ How to Run Locally

1. Clone the repository:

```bash
git clone https://github.com/ogcode-27/Taskouflage.git
```

2. Open the project folder:

```bash
cd Taskouflage
```

3. Open the folder in Visual Studio Code.

4. Run `index.html` using the VS Code Live Server extension.

5. The website will open in your browser.

---

## 🌐 Live Deployment

The frontend is deployed using AWS Amplify.

**GitHub Repository:**  
https://github.com/ogcode-27/Taskouflage

**Live Website:**  
[Add your working AWS Amplify URL here]

---

## 🎯 Project Objectives

- Simplify daily task management.
- Improve focus and time management.
- Provide productivity insights through analytics.
- Implement secure authentication.
- Demonstrate AWS serverless cloud architecture.
- Provide separate user and administrator experiences.

---

## 🔮 Future Enhancements

- Advanced productivity reports.
- Task reminders and notifications.
- Enhanced analytics and visualizations.
- Improved productivity recommendations.
- Additional dashboard customization.

---

## 👨‍💻 Project Information

**Project Name:** Taskouflage – Mission: Look Busy

**Category:** Web Application / Cloud Computing

**Frontend:** HTML, CSS, JavaScript

**Cloud Platform:** Amazon Web Services (AWS)

**Repository:** https://github.com/ogcode-27/Taskouflage

---

## 📜 License

This project is developed for educational and academic purposes.

---

### ⭐ Thank You

Thank you for visiting Taskouflage!

**Taskouflage – Work smarter. Look spectacular.**
