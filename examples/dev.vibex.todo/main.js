// A todo list that lives in the right rail.
//
// The panel is a real view: it keeps its own state, redraws through
// `cx.notify()`, and survives a restart because the list is written to the
// plugin's own settings store (`vibex.settings`, granted by the `storage`
// capability the manifest declares).
//
// The rail is narrow, so the layout is a single column: a header, a composer,
// the list, and a footer with the filters.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, Button, Checkbox, Input, InputState } from "gpui-base";
import { get, save } from "vibex.settings";

const KEY = "items";
const SPACE = { xs: 4, sm: 8, md: 12, lg: 16 };
const FILTERS = [
  ["all", "All"],
  ["active", "Active"],
  ["done", "Done"],
];

export default class TodoList extends View {
  init() {
    // `View`'s constructor calls `init`, so every field is assigned here
    // rather than declared as a class field.
    this.draft = InputState.new({ placeholder: "Add a task" });
    this.draft.on("submit", (_event, cx) => this.add(cx));
    this.saved = true;
    this.items = this.load();
    this.nextId = this.items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    this.filter = "all";
  }

  get completed() {
    return this.items.filter((item) => item.done).length;
  }

  get remaining() {
    return this.items.length - this.completed;
  }

  load() {
    try {
      const stored = get(KEY);
      return Array.isArray(stored) ? stored : [];
    } catch (error) {
      console.warn(`todo: settings unavailable (${error.message})`);
      this.saved = false;
      return [];
    }
  }

  commit(cx) {
    try {
      save(KEY, this.items);
      this.saved = true;
    } catch (error) {
      console.warn(`todo: could not save (${error.message})`);
      this.saved = false;
    }
    cx.notify();
  }

  add(cx) {
    const caption = this.draft.value().trim();
    if (caption === "") return;
    this.items = [...this.items, { id: this.nextId, caption, done: false }];
    this.nextId += 1;
    this.draft.set_value("");
    this.commit(cx);
  }

  toggle(id, done, cx) {
    this.items = this.items.map((item) => (item.id === id ? { ...item, done } : item));
    this.commit(cx);
  }

  remove(id, cx) {
    this.items = this.items.filter((item) => item.id !== id);
    this.commit(cx);
  }

  clearCompleted(cx) {
    if (this.completed === 0) return;
    this.items = this.items.filter((item) => !item.done);
    this.commit(cx);
  }

  setFilter(filter, cx) {
    this.filter = filter;
    cx.notify();
  }

  visible() {
    if (this.filter === "all") return this.items;
    return this.items.filter((item) => (this.filter === "done") === item.done);
  }

  render(cx) {
    const colors = cx.theme().colors;
    const visible = this.visible();

    return v_flex()
      .size_full()
      .min_h_0()
      .gap(SPACE.sm)
      .p(SPACE.md)
      .bg(colors.background)
      .child(this.header(colors))
      .child(this.composer(cx, colors))
      .child(
        v_flex()
          .flex_1()
          .min_h_0()
          .gap(SPACE.xs)
          .when(visible.length === 0, (el) =>
            el.child(
              div()
                .py(SPACE.lg)
                .text_size(12)
                .text_color(colors.muted_foreground)
                .child(this.emptyCopy()),
            ),
          )
          .children(visible.map((item) => this.row(item, cx, colors))),
      )
      .child(this.footer(cx, colors));
  }

  header(colors) {
    return h_flex()
      .w_full()
      .items_center()
      .justify_between()
      .child(
        div()
          .text_size(13)
          .font_semibold()
          .text_color(colors.foreground)
          .child("Todo"),
      )
      .child(
        div()
          .text_size(11)
          .text_color(colors.muted_foreground)
          .child(this.items.length === 0 ? "Nothing yet" : `${this.remaining} left`),
      );
  }

  composer(cx, colors) {
    return h_flex()
      .w_full()
      .items_center()
      .gap(SPACE.xs)
      .child(
        Input.new(this.draft)
          .flex_1()
          .h(28)
          .px(SPACE.sm)
          .border(1)
          .border_color(colors.input)
          .bg(colors.surface)
          .text_size(12),
      )
      .child(
        Button.new("todo-add")
          .h(28)
          .px(SPACE.md)
          .border(1)
          .border_color(colors.primary)
          .bg(colors.primary)
          .text_color(colors.primary_foreground)
          .text_size(12)
          .on_click((_event, cx) => this.add(cx))
          .child("Add"),
      );
  }

  row(item, cx, colors) {
    return Checkbox.new(`todo-item-${item.id}`)
      .checked(item.done)
      .w_full()
      .py(SPACE.xs)
      .hover((style) => style.bg(colors.muted))
      .on_change((done, cx) => this.toggle(item.id, done, cx))
      .child(
        div()
          .w(14)
          .h(14)
          .flex_none()
          .flex()
          .items_center()
          .justify_center()
          .border(1)
          .border_color(item.done ? colors.primary : colors.muted_foreground)
          .when(item.done, (el) =>
            el.bg(colors.primary).child(
              div()
                .text_size(10)
                .text_color(colors.primary_foreground)
                .child("✓"),
            ),
          ),
      )
      .child(
        h_flex()
          .flex_1()
          .items_center()
          .justify_between()
          .gap(SPACE.sm)
          .child(
            div()
              .flex_1()
              .text_size(12)
              .text_color(item.done ? colors.muted_foreground : colors.foreground)
              .when(item.done, (el) => el.line_through())
              .child(item.caption),
          )
          .child(
            Button.new(`todo-remove-${item.id}`)
              .flex_none()
              .w(20)
              .h(20)
              .flex()
              .items_center()
              .justify_center()
              .text_size(12)
              .text_color(colors.muted_foreground)
              .hover((style) => style.text_color(colors.destructive))
              .on_click((_event, cx) => this.remove(item.id, cx))
              .child("×"),
          ),
      );
  }

  footer(cx, colors) {
    return h_flex()
      .w_full()
      .items_center()
      .justify_between()
      .child(
        h_flex()
          .items_center()
          .gap(SPACE.xs)
          .children(
            FILTERS.map(([id, caption]) =>
              Button.new(`todo-filter-${id}`)
                .h(22)
                .px(SPACE.sm)
                .text_size(11)
                .bg(this.filter === id ? colors.muted : colors.background)
                .text_color(this.filter === id ? colors.foreground : colors.muted_foreground)
                .on_click((_event, cx) => this.setFilter(id, cx))
                .child(caption),
            ),
          ),
      )
      .child(
        Button.new("todo-clear")
          .h(22)
          .px(SPACE.sm)
          .text_size(11)
          .text_color(this.completed === 0 ? colors.muted_foreground : colors.destructive)
          .on_click((_event, cx) => this.clearCompleted(cx))
          .child("Clear done"),
      );
  }

  emptyCopy() {
    if (this.items.length === 0) return "Add the first task above.";
    if (this.filter === "done") return "Nothing finished yet.";
    return "All done.";
  }
}
