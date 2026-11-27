---
title: "Durability in LangGraph, Vercel AI SDK and Pi-Durable"
date: 2026-11-26
draft: false
slug: "durability-langgraph-vercel-ai-sdk-pi-durable"
summary: "What happens to an agent run when the process dies halfway? Comparing how LangGraph, Vercel AI SDK and Pi-Durable handle durability."
categories:
  - "tech"
tags:
  - "ai-agents"
  - "durable-execution"
  - "langgraph"
  - "vercel-ai-sdk"
  - "pi-durable"
  - "system-design"
---

When we a server running in production, there are many things that can go wrong. The node can crash, someone in the datacenter can trip over a wire and unplug your server's cables.

If you have written your pogram state in memory, which happens to be volatile, you could end up with losing state. A software that keeps the program state functional across crashing is a durable software

For an API, the responses are usually faster but, for an AI agent, the turns are slower and potentially hours and days. It can involve multiple rounds of trips communication b/w the models, harness and tools given to the models. This means, there is a lot of state to track and the cost of repeating all the steps is not just expensive but, could potentially have unwanted side effects like making a payment twice.

For a new project that we are building at VI, I thought of comparing the common frameworks for building AI agents - Langchain's Langgraph, Vercel's AI SDK and Earendil's pi durable

The examples below are shortened from a prototype for that project, with imports, schemas, and app helpers omitted.

## Langchain's Langgraph

The oldest and most widely used. It has the most abstraction out of all. It wants you to imagine the agentic loop as a stateful graph where each node can itself be a graph as well.

You get durability by the concept of **checkpointers**. Every node saves their result in the db after they are executed.

1. The checkpointer is just an object which essentially wraps a connection with a particular identifier for the thread

2. Nothing inside a node gets saved. So a crash in the middle of the node run, re-runs the whole node and it's side effects can repeat

3. Multiple processes work but, nothing stops 2 runs on the same thread at once - you have to manage your own lock

4. After a restart, if a thread has unfinished work, the app will have to explicitly resume the same thread. Pass `null` as input to `graph.invoke` and reuse the original `thread_id`.

If `lookup` was checkpointed and the process dies inside `answer`, the graph can reuse `policy` and run `answer` again from the start.

```typescript
const graph = new StateGraph(CoachState)
  .addNode('lookup', async ({ question }) => ({
    // The actual tool work happens inside this node.
    policy: await lookupHandbook(question),
  }))
  // If interrupted, this node can rerun from the top using the saved policy.
  .addNode('answer', async ({ question, policy }) => ({
    answer: await draftReply(question, policy),
  }))
  .addEdge(START, 'lookup')
  .addEdge('lookup', 'answer')
  .addEdge('answer', END)
  // Store graph checkpoints in SQLite, keyed by thread_id.
  .compile({ checkpointer: SqliteSaver.fromConnString('checkpoints.sqlite') });

// After a restart, the app will have to explicitly resume the same thread.
// Passing null tells LangGraph to continue from the saved checkpoint.
await graph.invoke(null, { configurable: { thread_id: threadId } });
```

## Vercel's AI SDK (+Workflow)

The AI SDK handles model calls, tool execution, and streaming. Workflow adds durable execution, so an interrupted run can recover after a server restart.

**Workflow adds the following:**

1. Workflow records completed step results in an event log. After a crash, the runtime can replay the workflow code and reuse the recorded results of completed steps.

2. Workflow retries failed steps automatically by default. You can set the retry limit per step with `stepFn.maxRetries`.

**Vercel Workflow requires a compile step.** You mark two kinds of functions:

1. Mark a function as a workflow with `'use workflow'`. It orchestrates the process, must be safe to replay, and delegates external I/O to steps.

2. Mark a function as a step with `'use step'`. A step can perform side effects such as writing to a database or calling an API.

The Workflow compiler recognizes `'use workflow'` and `'use step'` as directives and registers the marked functions by ID in the generated bundles. Inside the workflow bundle, step references become proxies that send step calls to the runtime.

Each workflow run gets its own `run_id`, and each step invocation gets its own `correlation_id`. The runtime executes the compiled workflow code in a JavaScript sandbox.

When the workflow calls a step, the proxy submits a request and returns a promise. If that invocation already completed, the runtime resolves the promise with the recorded result. Otherwise, it dispatches the step as needed and records the result when it completes.

The runtime reads and writes the event log through the World, a backend adapter for storage and queueing. The Postgres World stores workflow data in a dedicated workflow schema.

Here's the same lookup and answer sequence as a workflow. On replay, `await lookup(question)` can give back the recorded `policy` without calling the handbook again.

```typescript
async function answerQuestion(question: string) {
  'use workflow'; // The runtime can replay this orchestration code.
  // The compiler turns lookup into a proxy that can return a recorded result.
  const policy = await lookup(question);
  return answer(question, policy);
}

async function lookup(question: string) {
  'use step'; // Workflow records the step result in the event log.
  // The actual tool work happens inside this step.
  return lookupHandbook(question);
}
lookup.maxRetries = 2; // Allow two retries after the initial attempt.

async function answer(question: string, policy: string) {
  'use step'; // This step records the generated text so replay can reuse it.
  const { text } = await generateText({
    model,
    prompt: `Answer ${question} using this policy:\n${policy}`,
  });
  return text;
}
```

## Earendil's Pi Durable

Among the frameworks that I compared. Pi durable had the least amount of moving parts. It happens to be the closes to the basic agent loop as well. It is the newest among the three and currently experimental.

It provides you with flexibility to create your own storage backend that you could use. It works as follows:

1. Every user message, model call, tool call and each of the responses are stored in the storage

2. Every tool call is a state machine in itself

3. You can mark a tool as **replay safe**.  meaning, pi is free to re-execute it. Side effects inside it can happen twice, so this is where you need an idempotency key. If not specified as replay safe, pi will not re-execute it and model will get an interrupted tool call as a result.

4. Allows for multi player conversations and forking of a conversation naturally

5. After the crash, the boot can directly restart the pending and interrupted tasks

6. Partial answers are saved while they stream, about every 100 ms, so a crash mid-answer doesn't lose what was already shown.

7. Tasks have versions and migrations, so a new deploy can pick up tasks created by older code

8. Durable timers are natively supported

### The disadvantages

1. Only one process can access the storage that means only one pod (if you are using k8s) of the agent will run. If you want to use same database for multiple agents, in postgres one way to do that is to use different schemas for different agents.

   During deployment, we will have to be careful that only one storage is using the db at that time and thus needs some handling like a lease on the storage

2. The package is experimental and is prone to breaking apis

In the coach prototype, the handbook lookup is safe to repeat. The reminder tool leaves `replay` unset because repeating the call could schedule a second reminder.

```typescript
// Pi records each tool call's intent before running execute.
const tools = [
  defineTool({
    ...handbookDefinition,
    // The tool does its actual work in execute.
    execute: lookupHandbook,
    // A read-only lookup can run again if the process dies mid-call.
    replay: 'safe',
  }),
  // With replay unset, an interrupted call returns an error to the model.
  defineTool({
    ...reminderDefinition,
    execute: scheduleReminder,
  }),
];

const registry = createRegistry();
registry.install(defineExtension({ name: 'coach', tools }));
// On restart, reopen the same database to recover pending work.
const storage = await openNodeSqliteStorage('durable.sqlite');
const harness = await Harness.open(storage, { models, registry }, context);
harness.resume();
```
