import { Command } from "../../deps/cliffy/command.ts";
import { connectToServer } from "../common.ts";
import { ViewFocus } from "../../dmux/spec.ts";
import { Static } from "../../deps/typebox.ts";
import { makeEventSource, run as runTui } from "../../tui/index.ts";
import { ListView, State as ListViewState } from "../../tui/list-view.ts";

export const Cmd = new Command()
  .name("vars")
  .description("View variables.")
  .option("--session-name <sessionName:string>", "Session name.")
  .option("--scope-name <scope:string>", "Scope name.", {
    default: "Locals",
  })
  .action(async ({ sessionName, scopeName }) => {
    const [_client, stub] = await connectToServer(sessionName);

    await stub["dmux/listen"]({});

    // TODO: make it possible to choose scope on start up

    const [source, sink] = makeEventSource();

    let focus: Static<typeof ViewFocus> = {};
    const listItems: string[] = [];
    const varRefs: number[] = [];

    const viewVars = async (ref: number) => {
      const varsResp = await stub.variables({
        variablesReference: ref,
      });

      varRefs.length = 0;
      listItems.length = 0;
      for (const variable of varsResp.variables) {
        varRefs.push(variable.variablesReference);
        const separator = variable.type ? `: ${variable.type} = ` : " = ";
        const expandHint = variable.variablesReference > 0 ? " [...]" : "";
        listItems.push(
          `${variable.name}${separator}${variable.value}${expandHint}`,
        );
      }
    };

    const listViewState: ListViewState = {
      title: scopeName,
      selectedIndex: 0,
      list: listItems,
      selectionChanged: (index) => {
        return viewVars(varRefs[index]);
      },
    };

    const refresh = async () => {
      if (focus.threadId === undefined) {
        const info = await stub["dmux/info"]({});
        focus = info.viewFocus;
      }

      if (focus.stackFrameId !== undefined) {
        const scopesResult = await stub.scopes({
          frameId: focus.stackFrameId,
        });

        for (const scope of scopesResult.scopes) {
          if (scope.name === scopeName) {
            listItems.length = 0;
            varRefs.length = 0;

            const varsResp = await stub.variables({
              variablesReference: scope.variablesReference,
            });

            varRefs.length = 0;
            listItems.length = 0;
            for (const variable of varsResp.variables) {
              varRefs.push(variable.variablesReference);
              const separator = variable.type ? `: ${variable.type} = ` : " = ";
              const expandHint = variable.variablesReference > 0
                ? " [...]"
                : "";
              listItems.push(
                `${variable.name}${separator}${variable.value}${expandHint}`,
              );
            }

            break;
          }
        }

        sink({ type: "refresh" });
      }
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

    await refresh();
    await runTui(ListView(listViewState), source);
  });
