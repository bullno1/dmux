import { Command } from "../../deps/cliffy/command.ts";
import { connectToServer } from "../common.ts";
import { ViewFocus } from "../../dmux/schema.ts";
import { Variable } from "../../dap/schema.ts";
import { Static } from "../../deps/typebox.ts";
import { makeEventSource, run as runTui } from "../../tui/index.ts";
import { ListView, State as ListViewState } from "../../tui/list-view.ts";
import { forwardLogToServer } from "../../dmux/logging.ts";
import { getLogger } from "../../logging.ts";

type FrameState = {
  viewPath: string[];
};

type ThreadState = Map<number, FrameState>;

type ViewState = Map<number, ThreadState>;

export const Cmd = new Command()
  .name("vars")
  .description("View variables.")
  .option("--session-name <sessionName:string>", "Session name.")
  .option("--scope-name <scope:string>", "Scope name.", {
    default: "Locals",
  })
  .action(async ({ sessionName, scopeName }) => {
    const [_client, stub] = await connectToServer(sessionName);
    const logger = getLogger({ name: "view/vars" });
    forwardLogToServer(stub);

    await stub["dmux/listen"]({});

    // TODO: make it possible to choose scope on start up

    const [source, sink] = makeEventSource();

    let focus: Static<typeof ViewFocus> = {};
    const listItems: string[] = [];
    const viewState: ViewState = new Map<number, Map<number, FrameState>>();
    let variables: Static<typeof Variable>[] = [];
    let currentFrameState: FrameState = { viewPath: [] };

    const listViewState: ListViewState = {
      title: scopeName,
      selectedIndex: 0,
      list: listItems,
      selectionChanged: async (index) => {
        const variable = variables[index];
        if (variable.variablesReference <= 0) {
          return;
        }

        currentFrameState.viewPath.push(variable.name);
        variables = (await stub.variables({
          variablesReference: variable.variablesReference,
        })).variables;
        logger.debug(variables);
        refreshView();
      },
      keyPressed: async (index, event) => {
        switch (event.key) {
          case "backspace":
            if (currentFrameState.viewPath.length > 0) {
              currentFrameState.viewPath.pop();
              await refresh();
            }
            break;
          case "w":
            {
              const variable = variables[index];
              const expression = variable.evaluateName !== undefined
                ? variable.evaluateName
                : [...currentFrameState.viewPath, variable.name].join(".");

              logger.debug("Adding watch", expression, focus.stackFrameId);
              await stub["dmux/addWatch"]({
                watch: {
                  expression,
                  frameId: focus.stackFrameId,
                },
              });
            }
            break;
        }
      },
    };

    const refreshView = () => {
      listItems.length = 0;
      for (const variable of variables) {
        const separator = variable.type ? `: ${variable.type} = ` : " = ";
        const expandHint = variable.variablesReference > 0 ? " [...]" : "";
        listItems.push(
          `${variable.name}${separator}${variable.value}${expandHint}`,
        );
      }

      const pathHint = currentFrameState.viewPath.length > 0 ? "." : "";
      listViewState.title = `${scopeName}${pathHint}${
        currentFrameState.viewPath.join(".")
      }`;
    };

    const refresh = async () => {
      if (focus.threadId === undefined) {
        const info = await stub["dmux/info"]({});
        focus = info.viewFocus;
      }

      if (focus.threadId === undefined) {
        return;
      }

      let threadState = viewState.get(focus.threadId);
      if (threadState === undefined) {
        threadState = new Map<number, FrameState>();
        viewState.set(focus.threadId, threadState);
      }

      if (focus.stackFrameId === undefined) {
        return;
      }

      let frameState = threadState.get(focus.stackFrameId);
      if (frameState === undefined) {
        frameState = { viewPath: [] };
        threadState.set(focus.stackFrameId, frameState);
      }
      currentFrameState = frameState;

      const scopesResult = await stub.scopes({
        frameId: focus.stackFrameId,
      });

      for (const scope of scopesResult.scopes) {
        if (scope.name !== scopeName) {
          continue;
        }

        // Since variablesReference is invalidated with every event we have to
        // follow the view path by name
        let varRef = scope.variablesReference;
        variables = (await stub.variables({
          variablesReference: varRef,
        })).variables;
        logger.debug(variables);

        for (let i = 0; i < frameState.viewPath.length; ++i) {
          let varFound = false;
          for (const variable of variables) {
            if (variable.name === frameState.viewPath[i]) {
              varRef = variable.variablesReference;
              variables = (await stub.variables({
                variablesReference: varRef,
              })).variables;
              logger.debug(variables);
              varFound = true;
              break;
            }
          }

          if (!varFound) {
            frameState.viewPath.length = i;
            break;
          }
        }

        refreshView();

        break;
      }

      sink({ type: "refresh" });
    };

    stub.on("dmux/focus", (event) => {
      if (
        event.focus.threadId !== focus.threadId ||
        event.focus.stackFrameId !== focus.stackFrameId
      ) {
        focus = event.focus;
        refresh();
      }
    });

    stub.on("stopped", (_event) => {
      refresh();
    });

    await refresh();
    await runTui(ListView(listViewState), source);
  });
