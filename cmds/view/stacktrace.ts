import { Command } from "../../deps/cliffy/command.ts";
import { connectToServer } from "../common.ts";
import { StackFrame } from "../../dap/schema.ts";
import { ViewFocus } from "../../dmux/spec.ts";
import { Static } from "../../deps/typebox.ts";
import { makeEventSource, run as runTui } from "../../tui/index.ts";
import { ListView, State as ListViewState } from "../../tui/list-view.ts";

export const Cmd = new Command()
  .name("stacktrace")
  .description("Stacktrace for the current thread.")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }) => {
    const [_client, stub] = await connectToServer(sessionName);

    await stub["dmux/listen"]({});

    const [source, sink] = makeEventSource();

    let focus: Static<typeof ViewFocus> = {};
    let stackFrames: Static<typeof StackFrame>[] = [];
    const stackEntryList: string[] = [];

    const setFocusFrame = (id: number) => {
      return stub["dmux/focus"]({
        focus: { stackFrameId: id },
      });
    };

    const listViewState: ListViewState = {
      title: "Stacktrace",
      selectedIndex: 0,
      list: stackEntryList,
      selectionChanged: async (index) => {
        focus.stackFrameId = stackFrames[index].id;
        await setFocusFrame(stackFrames[index].id);
      },
    };

    const refresh = async () => {
      if (focus.threadId === undefined) {
        const info = await stub["dmux/info"]({});
        focus = info.viewFocus;
      }

      if (focus.threadId !== undefined) {
        const stackTraceResponse = await stub.stackTrace({
          threadId: focus.threadId,
          format: {
            includeAll: true,
          },
        });

        stackFrames = stackTraceResponse.stackFrames;
        if (focus.stackFrameId === undefined && stackFrames.length > 0) {
          await setFocusFrame(stackFrames[0].id);
          return; // Wait for dmux/focus to bounce back
        }

        stackEntryList.length = 0;
        formatStackTrace(stackEntryList, stackFrames);

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

function formatStackTrace(
  output: string[],
  frames: Static<typeof StackFrame>[],
) {
  for (const frame of frames) {
    const sourceRef = frame.source?.sourceReference || frame.source?.name;
    output.push(`${frame.name} (${sourceRef}:${frame.line}:${frame.column})`);
  }
}
