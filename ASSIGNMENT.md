# Infinix Labs — Forward Deployed Intern Assessment

A take-home assignment from Infinex Lab.

# Customer Operations Control Center

## Background

You have joined Infinix Labs as a Forward Deployed Engineer.

Your first customer, NovaCommerce, is a growing e-commerce business. Its operations, finance and customer support teams rely on separate systems to manage orders, payments and shipments.

Employees constantly switch between tools, manually reconcile information, investigate failures and coordinate approvals. As the company grows, these processes are becoming increasingly unreliable.

NovaCommerce wants a unified internal operations platform that integrates its existing systems and automates repetitive business processes.

Your mission is to design and build a working version of this platform.

## Required technology

- Next.js and TypeScript.
- SQLite or PostgreSQL for persistent application data.
- REST API endpoints for core application functionality.
- Additional libraries and frameworks of your choice.

You are starting from scratch. We will provide simulated external business services, synthetic data and API documentation.

## Module 1: Operations dashboard

Build a dashboard that provides an overview of business operations.

It should display:

- Total orders and order status breakdown.
- Payment and shipment issues.
- Pending approvals.
- Recent workflow executions.
- Recent operational activity.

Metrics must reflect actual application data, not hardcoded values.

## Module 2: Order management

Build an interface where employees can:

- View, search, filter and paginate orders.
- Inspect individual orders, customer information, payments and shipment details.
- Request order cancellations and refunds.
- View the current state and outcome of operations.

Shipped or delivered orders cannot be cancelled. Refunds require a captured payment and a cancelled or delivered order.

Business operations must interact with the provided external APIs.

## Module 3: External service integration

Integrate the provided Commerce, Payment and Shipping APIs.

Your application should:

- Import and synchronize data from all three services.
- Handle incoming webhook events.
- Maintain consistent application state.
- Handle failed external requests.
- Provide visibility into synchronization and integration errors.

The application must remain usable when an external service temporarily becomes unavailable.

## Module 4: Workflow automation engine

Build a system that allows employees to configure and execute business automations.

A workflow must contain a trigger, at least one condition and an action.

Support at least these triggers:

- Payment failure.
- Shipment update.
- Order cancellation.

Support conditions based on business data, such as order amount, payment status and shipment status.

Support at least these actions:

- Create a support ticket.
- Request a refund.

Example: When a shipment is marked delayed and the order value exceeds ₹5,000, create a support ticket.

Employees should be able to create, edit, enable and disable workflows.

Workflows must execute against real application data. Each execution should record its outcome, including failed operations.

A simple configuration form is sufficient. A drag-and-drop workflow builder is not required.

## Module 5: Approvals and permissions

The application will be used by three types of employees:

- Operator: can view orders and initiate operations.
- Manager: can initiate operations and review pending approvals.
- Viewer: has read-only access.

Refunds require manager approval before execution.

Implement an approval queue where managers can approve or reject requests.

Permissions must be enforced on the backend, not just through hidden frontend buttons.

Maintain an audit history of consequential actions, including who performed them and their outcomes.

Local authentication with seeded demonstration accounts is acceptable.

## Module 6: Operations assistant (optional)

Build an assistant that accepts natural-language operational requests.

Examples:

- Show me all delayed shipments.
- Which refunds are waiting for approval?
- Investigate order NC-1004.
- Request a refund for order NC-1005.

The assistant should use actual application data and respect the same permissions and approval requirements as other application features.

A paid LLM API is not required. You may choose any appropriate implementation.

## Engineering expectations

- The application must run locally.
- Application data must persist across restarts.
- Core business functionality must be accessible through documented APIs.
- Appropriate loading, empty and error states should be implemented.
- The application should not require paid API keys or external accounts.
- You are free to make architectural and product decisions.

## Deliverables

Submit:

1. Complete application source code.
2. Database schema, migrations or reproducible initialization instructions.
3. Automated tests covering important business behaviour and failure cases.
4. README.md containing setup instructions, demo credentials and API documentation.
5. DECISIONS.md explaining important architectural choices, trade-offs, assumptions and known limitations.
6. Your project and relevant AI coding agent sessions through Steerwise.

## Time and priorities

You have eight hours of working time.

We do not expect an enterprise-ready application. Prioritize the core operational workflow, reliability and a functional user experience.

If you cannot complete every feature, document what remains incomplete and explain your prioritization.

You are encouraged to use AI coding agents throughout this assignment. You are responsible for understanding and verifying the software you deliver.

## Files

- `infinix-control-center-attachments.zip`

## What the company is looking for

- Understands business requirements before beginning implementation.
- Effectively communicates customer context to AI coding agents.
- Breaks down complex problems into manageable engineering tasks.
- Makes sensible full-stack architectural decisions.
- Understands and correctly integrates unfamiliar external APIs.
- Maintains data consistency across different systems.
- Implements business logic and authorization at the backend level.
- Identifies edge cases and verifies the agent's implementation.
- Tests failure scenarios rather than only successful operations.
- Prioritizes functional customer outcomes over superficial visual polish.
- Demonstrates ownership of the generated code.
- Explains technical decisions, trade-offs and limitations in their own words.

## Links you must give

Infinex Lab asks for a GitHub repository link and a live link (where the project is deployed) with your work. They're checked when you submit, and the upload is refused until they pass, so do this before the deadline:

- Repository: push this folder to a public repository on GitHub (GitLab or Bitbucket work too), with everything committed and pushed: the upload takes the folder's git remote and checks the repository holds your latest commit.
- Live link: deploy the project somewhere anyone can open it without a login (such as Vercel, Netlify, Render or your own server). You give the address when you submit, and it must answer.

## Submitting

Your sessions with Claude Code, Codex, Gemini CLI, Antigravity, VS Code Copilot, Cursor, opencode, Copilot CLI, Windsurf, Zed run in this folder are collected when you submit. Windsurf is collected through the hook in .windsurf/hooks.json: keep that file, and trust this folder when Windsurf asks (hooks don't run in Restricted Mode).

Chats in ChatGPT, claude.ai or the Gemini app (web or desktop) stay on those companies' servers, so they can't be collected: build with a coding agent in this folder (Codex instead of ChatGPT, Claude Code instead of claude.ai), or add the chat's share link when you share. Your project counts either way.
