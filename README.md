# chess
Vibe coded chess. The entire project has been built using prompts. Check the closed PRs for the actual prompts.


## The initial prompt
```Write the code for a Chess game. It should be written in Node JS, and React. Don't use Redux. It will be stateless (for now). Use webpack as well. I'll deploy on AppEngine. Use this library to assist with chess rules https://github.com/jhlywa/chess.js/```

If you want to see it in action, here you go:

## 🚀 Getting started
This repository contains a Node.js 20 application bundled with Webpack and deployed on Google App Engine (Standard Environment).
The app serves static assets from the /dist directory via server.js, as defined in app.yaml.

# Prerequisites

Before getting started, install the following tools:
	•	Node.js 20+
	•	npm or yarn
	•	Google Cloud SDK

1. Verify your setup

```
node -v
npm -v
gcloud version
```

2. Clone the Repository
```
git clone https:///github.com/ctborg/chess.git
cd chess
```

3. Install Dependencies

`npm install`

If using Yarn:

`yarn install`

4. Build the Project

Use Webpack to bundle your source files:

`npm run build`

This will compile your assets and place them in /dist.


5. Run Locally

You can run the app in either development or production mode:

Development:

`npm run dev`

Production (serves built /dist output):

`npm start`

Then visit http://localhost:8080.


## ⚙️ Deploying to Google App Engine

Authenticate with Google Cloud and set your project:

```
gcloud auth login
gcloud config set project <change-this-to-your-project-id>
```
Then deploy:

`gcloud app deploy`

Once deployed, open it in your browser:

`gcloud app browse`


## 🧰 Useful Commands

Command	Description
`npm run build`	- Bundle the app with Webpack
`npm run dev`	- Start Webpack Dev Server
`npm start`	- Run the app in production mode
`gcloud app deploy` -	Deploy to Google App Engine
`gcloud app browse`	- Open deployed app in the browser

⸻

## 📄 License

This project is not licensed.
