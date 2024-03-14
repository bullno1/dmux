import { Command } from "../../deps/cliffy/command.ts";
import { connectToServer } from "../common.ts";
import { makeEventSource, run as runTui } from "../../tui/index.ts";
import { ListView, State as ListViewState } from "../../tui/list-view.ts";
import { forwardLogToServer } from "../../dmux/logging.ts";
import { getLogger } from "../../logging.ts";
import { Static } from "../../deps/typebox.ts";
import { WatchData as WatchDataSpec } from "../../dmux/schema.ts";
import { EvaluateResponse, StackFrame } from "../../dap/schema.ts";

export const Cmd = new Command()
  .name("watch")
  .description("View watches.")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }) => {
    const [client, stub] = await connectToServer(sessionName);
    const logger = getLogger({ name: "view/watch" });
    forwardLogToServer(stub);

    const [source, sink] = makeEventSource();
    const watches = new Map<number, Static<typeof WatchDataSpec>>();
    const watchResults = new Map<number, Static<typeof EvaluateResponse>>();
    const listItems: string[] = [];

    const refresh = async () => {
      const stackTraces = new Map<number, Static<typeof StackFrame>[]>();

      watchResults.clear();
      for (const [id, watchData] of watches.entries()) {
        try {
          let frameId = undefined;
          if (watchData.context !== undefined) {
            let stackTrace = stackTraces.get(watchData.context.threadId);
            if (stackTrace === undefined) {
              stackTrace = (await stub.stackTrace({
                threadId: watchData.context.threadId,
              })).stackFrames;
              stackTraces.set(watchData.context.threadId, stackTrace);
            }

            if (watchData.context.frameOffset >= stackTrace.length) {
              continue;
            }

            const frameIndex = stackTrace.length -
              watchData.context.frameOffset - 1;
            frameId = stackTrace[frameIndex].id;
          }

          watchResults.set(
            id,
            await stub.evaluate({
              context: "watch",
              expression: watchData.expression,
              frameId,
            }),
          );
        } catch (e) {
          logger.error(e);
        }

        listItems.length = 0;
        for (const [id, watchData] of watches.entries()) {
          const result = watchResults.get(id);
          listItems.push(
            `${watchData.expression} = ${
              result !== undefined ? result.result : "<Error>"
            }`,
          );
        }
      }

      sink({ type: "refresh" });
    };

    const listViewState: ListViewState = {
      title: "Watches",
      selectedIndex: 0,
      list: listItems,
      selectionChanged: async () => {
      },
    };

    try {
      await stub["dmux/listen"]({});

      stub.on("dmux/addWatch", ({ id, data }) => {
        watches.set(id, data);
        refresh().catch((e) => logger.error(e));
      });

      stub.on("dmux/removeWatch", ({ id }) => {
        watches.delete(id);
        refresh().catch((e) => logger.error(e));
      });

      stub.on("stopped", () => {
        refresh().catch((e) => logger.error(e));
      });

      const existingWatches = await stub["dmux/getWatches"]({});
      for (const [id, watchData] of Object.entries(existingWatches)) {
        watches.set(parseInt(id), watchData);
      }

      await refresh();
      await runTui(ListView(listViewState), source);
    } finally {
      await client.stop();
    }
  });
