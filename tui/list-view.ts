import { Tui } from "./index.ts";
import {
  clearScreen,
  colors,
  cursorHide,
  cursorTo,
} from "../deps/cliffy/ansi.ts";

export interface State {
  title: string;
  list: string[];
  selectedIndex: number;
  selectionChanged?: (index: number) => Promise<void> | void;
}

export function ListView(state: State): Tui {
  return async (ctx) => {
    let activeIndex = state.selectedIndex;
    do {
      activeIndex = Math.max(
        0,
        Math.min(activeIndex, state.list.length - 1),
      );

      const renderCtx = ctx.beginRender();
      renderCtx.write(clearScreen);
      renderCtx.write(cursorHide);
      renderCtx.write(cursorTo(1, 1));
      renderCtx.write(state.title);
      for (let index = 0; index < state.list.length; ++index) {
        renderCtx.write(cursorTo(1, index + 2));
        renderCtx.write(index === activeIndex ? "> " : "  ");

        const item = state.list[index];
        renderCtx.write(
          index === state.selectedIndex ? colors.underline(item) : item,
        );
      }
      renderCtx.endRender();

      const event = await ctx.nextEvent();

      switch (event.type) {
        case "done":
          return;
        case "keypress":
          if (event.value.type === "keydown") {
            if (event.value.key === "up" || event.value.key === "k") {
              activeIndex -= 1;
            } else if (event.value.key === "down" || event.value.key === "j") {
              activeIndex += 1;
            } else if (event.value.key === "return") {
              state.selectedIndex = activeIndex;
              await state.selectionChanged?.(activeIndex);
            }
          }
          continue;
        case "refresh":
        default:
          continue;
      }
    } while (true);
  };
}
