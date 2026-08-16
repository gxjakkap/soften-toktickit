# AI Usage for Lab 1

## Issue 1

| Prompt name | Prompt text | Reflection |
|:----|:---:|:---:|
| Scaffold repository structure | Scaffold a full-stack application monorepo with these folders<br><br>- client: a Vite React app using Typescript and Bootstrap for styling<br>- server: an Express app using Typescript and Prisma as an ORM, with a subfolder called `prisma` for prisma model files<br><br>This project will use these tools:<br>- Node.js as runtime<br>- pnpm as package manager<br>- PostgreSQL as database (set up a docker-compose.yaml for dev environment)<br><br>We're **not** using any external monorepo tooling (e.g. turborepo, nx) so don't set it up<br>Add a .gitignore at root and .env.example where applicable (in this case it should be for both client and server folder since they both require different env values)<br><br>For testing, we're using Vitest for frontend and supertest for backend. also set these 2 up.<br><br>Add a set up instruction in README.md at the root of the repo<br><br>**Additional instructions**<br>- Do **not** add anything not instructed in this prompt.<br>- If any subagent is spawned by you, at the end of the loop, print out the prompts you've given to your subagents to me. | This prompt worked and satisfied 99% of the acceptance criteria. Only thing left out is Bootstrap being used on the frontend. The agent only installed Bootstrap but hadn't changed the frontend code from Vite's default example code. |
| Fixing frontend to match acceptance criteria | check pr #6 approval status and fix maybe? | Works somehow. It uses `gh` to read PR status and comments and fix it by itself. |

## Issue 2

| Prompt name | Prompt text | Reflection |
|:----|:---:|:---:|
| Initiate a health check implementation task | Create a health check function<br><br>- Create /api/health where the json response contains status = ok and service = TokTickIT API.<br>- A Supertest test verifies the endpoint.<br>- Client display status from /api/health<br>- Error message when client can’t reach backend<br><br>additionally<br>- set up pnpm workspace on the root and add both folders to pnpm-workspace<br>- set up vite proxy for the backend on dev<br><br>Additional instructions<br>- Do **not** add anything not instructed in this prompt.<br>- If any subagent is spawned by you, at the end of the loop, print out the prompts you've given to your subagents to me.| Worked but missed some styling issues on frontend. |
| Fixing styling issue on frontend | looks kinda weird. maybe we ditch the vite boilerplate code and start clean. we only need the api status for now<br><br>[attached screenshot of the page] | Worked well. Removed the Vite boilerplate and the conflicting starter CSS, leaving just the API status display. |

## Issue 3

| Prompt name | Prompt text | Reflection |
|:----|:---:|:---:|
| Initiate a category seeding task | seed a category for it ticket requests<br><br>** DO EXACTLY WHAT I TOLD AND NOTHING ELSE. IF SOMETHING IS NOT CLEAR, ASK. **<br><br>- create prisma model with this at a minimum<br><br>model Category {<br>id Int @id @default(autoincrement())<br>name String<br>@unique<br>createdAt DateTime @default(now())<br>}<br><br>then migrate the models to the dev database. then insert these category as a seed data: Account and Access, Hardware, Software, and Network. The seed should be safe to run multiple time.| Worked in one shot. |
