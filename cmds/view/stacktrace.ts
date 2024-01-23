import { Command } from "../../deps/cliffy/command.ts";
import { connectToServer } from "../common.ts";
import { StackFrame } from "../../dap/schema.ts";
import { Static } from "../../deps/typebox.ts";
import { run as runTui, makeEventSource } from "../../tui/index.ts";
import { ListView } from "../../tui/list-view.ts";

export const Cmd = new Command()
  .name("stacktrace")
  .description("Stacktrace for the current thread.")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }) => {
    const [_client, stub] = await connectToServer(sessionName);

    await stub["dmux/listen"]({});

    const info = await stub["dmux/info"]({});
    let threadId = info.viewFocus.threadId;
    let stackFrames: Static<typeof StackFrame>[] = [];

    const [source, sink] = makeEventSource();

    const refresh = async () => {
      if (threadId !== undefined) {
        const stackTraceResponse = await stub.stackTrace({
          threadId: threadId,
          format: {
            includeAll: true,
          },
        });

        stackFrames = stackTraceResponse.stackFrames;
        stackEntryList.length = 0;
        formatStackTrace(stackEntryList, stackFrames);

        sink({ type: "refresh" });
      }
    };

    const stackEntryList: string[] = [];
    formatStackTrace(stackEntryList, stackFrames);

    const listViewState = {
      title: "Stacktrace",
      selectedIndex: 0,
      list: stackEntryList,
    };

    stub.on("dmux/focus", (event) => {
      if (event.focus.threadId !== null && event.focus.threadId !== threadId) {
        threadId = event.focus.threadId;
        refresh();
      }
    });

    stub.on("stopped", (_event) => {
      refresh();
    });

    await refresh();
    await runTui(ListView(listViewState), source);
  });

function formatStackTrace(output: string[], frames: Static<typeof StackFrame>[]) {
  for (const frame of frames) {
    const sourceRef = frame.source?.sourceReference || frame.source?.name;
    output.push(`${frame.name} (${sourceRef}:${frame.line}:${frame.column})`);
  }
}
