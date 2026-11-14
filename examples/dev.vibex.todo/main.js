// Todo — a task list that lives in the right rail.
//
// The panel is a real view: it keeps its own state, redraws through
// `cx.notify()`, and survives a restart because the list is written to the
// plugin's own settings store (`vibex.settings`, granted by the `storage`
// capability the manifest declares).
//
// The rail is narrow, so everything is one column: a header that reports
// progress, a composer, a scrolling list, and a footer of filters. Beyond
// add / tick / delete, the panel carries what makes a list usable once it
// stops being a demo: a priority per task, free-text search, inline editing,
// and a completed section that folds away instead of pushing live work off
// screen.
//
// Only `gpui-kit` and `gpui-base` are imported. The component catalog
// (`gpui-component`) is provided by the host and a build without it would fail
// to resolve the import, so everything here is drawn from base's own controls.

import { View, div } from "gpui-kit";
import {
  v_flex,
  h_flex,
  Button,
  Checkbox,
  Input,
  InputState,
  Progress,
  ProgressTrack,
  ProgressIndicator,
} from "gpui-base";
import { get, save } from "vibex.settings";

const KEY = "items";
const PREFS_KEY = "prefs";

// The rail's own spacing scale; four steps keep every gap on one rhythm.
const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

const FILTERS = [
  ["all", "All"],
  ["active", "Active"],
  ["done", "Done"],
];

// Priority is the field that changes a row's weight, so it is a small fixed
// set rather than free text: three levels a person can hold in their head.
const PRIORITIES = [
  ["high", "High"],
  ["normal", "Normal"],
  ["low", "Low"],
];

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

const SORTS = [
  ["manual", "Manual"],
  ["priority", "Priority"],
  ["recent", "Recent"],
];

export default class TodoList extends View {
  init() {
    // `View`'s constructor calls `init`, so every field is assigned here
    // rather than declared as a class field.
    this.draft = InputState.new({ placeholder: "Add a task" });
    this.draft.on("submit", (_event, cx) => this.add(cx));

    this.search = InputState.new({ placeholder: "Search tasks" });
    this.search.on("change", (_event, cx) => {
      this.query = this.search.value().trim().toLowerCase();
      cx.notify();
    });

    // One editor entity, rebound to whichever row is open, so opening a row
    // does not create an entity per task.
    this.editor = InputState.new({ placeholder: "Task" });
    this.editor.on("submit", (_event, cx) => this.commitEdit(cx));

    this.saved = true;
    this.items = this.load();
    this.nextId = this.items.reduce((max, item) => Math.max(max, item.id), 0) + 1;

    const prefs = this.loadPrefs();
    this.filter = prefs.filter || "all";
    this.sort = prefs.sort || "manual";
    this.query = "";
    this.editingId = null;
    this.doneOpen = prefs.doneOpen !== false;
    this.draftPriority = "normal";
  }

  // ---- persistence ----

  load() {
    try {
      const stored = get(KEY);
      return Array.isArray(stored) ? stored.map(normalizeItem) : [];
    } catch (error) {
      console.warn(`todo: settings unavailable (${error.message})`);
      this.saved = false;
      return [];
    }
  }

  loadPrefs() {
    try {
      const stored = get(PREFS_KEY);
      return stored && typeof stored === "object" ? stored : {};
    } catch (error) {
      return {};
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

  savePrefs() {
    try {
      save(PREFS_KEY, {
        filter: this.filter,
        sort: this.sort,
        doneOpen: this.doneOpen,
      });
    } catch (error) {
      // Preferences are a convenience; losing them is not worth a banner.
    }
  }

  // ---- derived state ----

  get completed() {
    return this.items.filter((item) => item.done).length;
  }

  get remaining() {
    return this.items.length - this.completed;
  }

  get ratio() {
    return this.items.length === 0 ? 0 : (this.completed / this.items.length) * 100;
  }

  // ---- mutations ----

  add(cx) {
    const caption = this.draft.value().trim();
    if (caption === "") return;
    this.items = [
      ...this.items,
      {
        id: this.nextId,
        caption,
        done: false,
        priority: this.draftPriority,
        createdAt: Date.now(),
        doneAt: null,
      },
    ];
    this.nextId += 1;
    this.draft.set_value("");
    this.commit(cx);
  }

  toggle(id, done, cx) {
    this.items = this.items.map((item) =>
      item.id === id ? { ...item, done, doneAt: done ? Date.now() : null } : item,
    );
    this.commit(cx);
  }

  remove(id, cx) {
    this.items = this.items.filter((item) => item.id !== id);
    if (this.editingId === id) this.editingId = null;
    this.commit(cx);
  }

  clearCompleted(cx) {
    if (this.completed === 0) return;
    this.items = this.items.filter((item) => !item.done);
    this.commit(cx);
  }

  cyclePriority(id, cx) {
    this.items = this.items.map((item) => {
      if (item.id !== id) return item;
      const next =
        item.priority === "high" ? "normal" : item.priority === "normal" ? "low" : "high";
      return { ...item, priority: next };
    });
    this.commit(cx);
  }

  setDraftPriority(priority, cx) {
    this.draftPriority = priority;
    cx.notify();
  }

  beginEdit(id, cx) {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) return;
    this.editingId = id;
    this.editor.set_value(item.caption);
    cx.notify();
  }

  commitEdit(cx) {
    if (this.editingId === null) return;
    const caption = this.editor.value().trim();
    if (caption === "") {
      // An empty edit is a cancel, not a deletion: deleting on an accidental
      // clear would lose the task with no undo.
      this.editingId = null;
      cx.notify();
      return;
    }
    const id = this.editingId;
    this.items = this.items.map((item) => (item.id === id ? { ...item, caption } : item));
    this.editingId = null;
    this.commit(cx);
  }

  cancelEdit(cx) {
    this.editingId = null;
    cx.notify();
  }

  setFilter(filter, cx) {
    this.filter = filter;
    this.savePrefs();
    cx.notify();
  }

  setSort(sort, cx) {
    this.sort = sort;
    this.savePrefs();
    cx.notify();
  }

  toggleDoneSection(cx) {
    this.doneOpen = !this.doneOpen;
    this.savePrefs();
    cx.notify();
  }

  // ---- selection ----

  visible() {
    let items = this.items.filter(
      (item) => this.query === "" || item.caption.toLowerCase().includes(this.query),
    );
    if (this.filter === "active") items = items.filter((item) => !item.done);
    else if (this.filter === "done") items = items.filter((item) => item.done);
    if (this.sort === "priority") {
      items = [...items].sort(
        (left, right) => PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority],
      );
    } else if (this.sort === "recent") {
      items = [...items].sort((left, right) => right.createdAt - left.createdAt);
    }
    return items;
  }

  // ---- render ----

  render(cx) {
    const colors = cx.theme().colors;
    const visible = this.visible();
    const open = visible.filter((item) => !item.done);
    const done = visible.filter((item) => item.done);

    return v_flex()
      .size_full()
      .min_h_0()
      .gap(SPACE.sm)
      .p(SPACE.md)
      .bg(colors.background)
      .child(this.header(colors))
      .child(this.composer(cx, colors))
      .when(this.items.length > 3, (column) => column.child(this.searchBar(colors)))
      .child(
        // `overflow_y_scroll` is base's own scrolling: the list scrolls under
        // the composer without a component the catalog has to provide.
        v_flex()
          .flex_1()
          .min_h_0()
          .w_full()
          .gap(SPACE.xs)
          .overflow_y_scroll()
          .when(open.length === 0 && done.length === 0, (column) =>
            column.child(this.empty(colors)),
          )
          .children(open.map((item) => this.row(item, cx, colors)))
          .when(done.length > 0, (column) =>
            column.child(this.doneSection(done, cx, colors)),
          ),
      )
      .child(this.footer(cx, colors));
  }

  header(colors) {
    const total = this.items.length;
    const label =
      total === 0
        ? "Nothing yet"
        : this.remaining === 0
          ? "All done"
          : `${this.remaining} left`;

    return v_flex()
      .w_full()
      .gap(SPACE.xs)
      .child(
        h_flex()
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
            h_flex()
              .items_center()
              .gap(SPACE.sm)
              .when(!this.saved, (row) =>
                row.child(div().text_size(10).text_color(colors.destructive).child("not saved")),
              )
              .child(
                div()
                  .text_size(11)
                  .text_color(colors.muted_foreground)
                  .child(label),
              ),
          ),
      )
      .when(total > 0, (column) =>
        column
          // `Progress` is the announcement, not the bar: it draws nothing at
          // all. The visible bar is a track holding an indicator the script
          // sizes from the same number it gave `value`.
          .child(
            Progress.new("todo-progress")
              .value(this.ratio)
              .accessibility_label(`${this.completed} of ${total} tasks done`)
              .w_full()
              .child(
                ProgressTrack.new()
                  .w_full()
                  .h(3)
                  .rounded(2)
                  .bg(colors.muted)
                  .child(
                    // `w` takes pixels for a number and a fraction for a
                    // `"50%"` string, so the ratio has to be spelled as a
                    // percentage or the bar would be a few pixels wide.
                    ProgressIndicator.new()
                      .h_full()
                      .w(`${this.ratio}%`)
                      .rounded(2)
                      .bg(colors.primary),
                  ),
              ),
          )
          .child(
            div()
              .text_size(10)
              .text_color(colors.muted_foreground)
              .child(`${this.completed}/${total} done`),
          ),
      );
  }

  composer(cx, colors) {
    return v_flex()
      .w_full()
      .gap(SPACE.xs)
      .child(
        h_flex()
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
          ),
      )
      .child(
        // The priority the next task will get, chosen before typing rather
        // than edited after the fact.
        h_flex()
          .w_full()
          .items_center()
          .gap(SPACE.xs)
          .children(
            PRIORITIES.map(([id, caption]) =>
              Button.new(`todo-draft-priority-${id}`)
                .h(20)
                .px(SPACE.sm)
                .text_size(10)
                .rounded(999)
                .bg(this.draftPriority === id ? colors.muted : colors.background)
                .text_color(
                  this.draftPriority === id ? colors.foreground : colors.muted_foreground,
                )
                .on_click((_event, cx) => this.setDraftPriority(id, cx))
                .child(caption),
            ),
          ),
      );
  }

  searchBar(colors) {
    return Input.new(this.search)
      .w_full()
      .h(26)
      .px(SPACE.sm)
      .border(1)
      .border_color(colors.input)
      .bg(colors.surface)
      .text_size(11);
  }

  doneSection(done, cx, colors) {
    return v_flex()
      .w_full()
      .gap(SPACE.xs)
      .mt(SPACE.sm)
      .child(
        h_flex()
          .w_full()
          .items_center()
          .justify_between()
          .cursor_pointer()
          .on_click((_event, cx) => this.toggleDoneSection(cx))
          .child(
            div()
              .text_size(10)
              .font_semibold()
              .text_color(colors.muted_foreground)
              .child(`${this.doneOpen ? "▾" : "▸"} Done · ${done.length}`),
          )
          .child(
            Button.new("todo-clear")
              .h(20)
              .px(SPACE.sm)
              .text_size(10)
              .text_color(colors.muted_foreground)
              .hover((style) => style.text_color(colors.destructive))
              .on_click((_event, cx) => this.clearCompleted(cx))
              .child("Clear"),
          ),
      )
      .when(this.doneOpen, (column) =>
        column.children(done.map((item) => this.row(item, cx, colors))),
      );
  }

  row(item, cx, colors) {
    if (this.editingId === item.id) {
      return h_flex()
        .w_full()
        .items_center()
        .gap(SPACE.xs)
        .p(SPACE.xs)
        .rounded(6)
        .bg(colors.muted)
        .child(
          Input.new(this.editor)
            .flex_1()
            .h(26)
            .px(SPACE.sm)
            .border(1)
            .border_color(colors.primary)
            .bg(colors.background)
            .text_size(12),
        )
        .child(
          Button.new(`todo-edit-save-${item.id}`)
            .h(24)
            .px(SPACE.sm)
            .text_size(11)
            .bg(colors.primary)
            .text_color(colors.primary_foreground)
            .on_click((_event, cx) => this.commitEdit(cx))
            .child("Save"),
        )
        .child(
          Button.new(`todo-edit-cancel-${item.id}`)
            .h(24)
            .px(SPACE.sm)
            .text_size(11)
            .text_color(colors.muted_foreground)
            .on_click((_event, cx) => this.cancelEdit(cx))
            .child("Cancel"),
        );
    }

    // A priority marker is a coloured bar, not a word: at this width a label
    // would push the caption out, and the colour carries the meaning.
    const marker =
      item.priority === "high"
        ? colors.destructive
        : item.priority === "low"
          ? colors.muted_foreground
          : colors.primary;

    return h_flex()
      .w_full()
      .items_center()
      .gap(SPACE.sm)
      .p(SPACE.xs)
      .rounded(6)
      .hover((style) => style.bg(colors.muted))
      .child(
        div()
          .flex_none()
          .w(3)
          .h(26)
          .rounded(2)
          .bg(item.done ? colors.border : marker),
      )
      .child(
        Checkbox.new(`todo-check-${item.id}`)
          .checked(item.done)
          .on_change((done, cx) => this.toggle(item.id, done, cx)),
      )
      .child(
        v_flex()
          .flex_1()
          .min_w_0()
          .gap(2)
          .cursor_pointer()
          .on_click((_event, cx) => this.beginEdit(item.id, cx))
          .child(
            div()
              .text_size(12)
              .text_color(item.done ? colors.muted_foreground : colors.foreground)
              .when(item.done, (text) => text.line_through())
              .child(item.caption),
          )
          .child(
            div()
              .text_size(9)
              .text_color(colors.muted_foreground)
              .child(relativeTime(item.done ? item.doneAt : item.createdAt, item.done)),
          ),
      )
      .child(
        Button.new(`todo-priority-${item.id}`)
          .flex_none()
          .w(22)
          .h(22)
          .text_size(11)
          .text_color(colors.muted_foreground)
          .hover((style) => style.text_color(colors.foreground))
          .on_click((_event, cx) => this.cyclePriority(item.id, cx))
          .child("!"),
      )
      .child(
        Button.new(`todo-remove-${item.id}`)
          .flex_none()
          .w(22)
          .h(22)
          .text_size(12)
          .text_color(colors.muted_foreground)
          .hover((style) => style.text_color(colors.destructive))
          .on_click((_event, cx) => this.remove(item.id, cx))
          .child("×"),
      );
  }

  empty(colors) {
    let copy;
    if (this.items.length === 0) copy = "Add the first task above.";
    else if (this.query !== "") copy = `Nothing matches “${this.query}”.`;
    else if (this.filter === "done") copy = "Nothing finished yet.";
    else if (this.filter === "active") copy = "Everything is done.";
    else copy = "All done.";

    return div()
      .w_full()
      .py(SPACE.xl)
      .text_size(11)
      .text_color(colors.muted_foreground)
      .text_center()
      .child(copy);
  }

  footer(cx, colors) {
    return h_flex()
      .w_full()
      .items_center()
      .justify_between()
      .gap(SPACE.xs)
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
                .text_color(
                  this.filter === id ? colors.foreground : colors.muted_foreground,
                )
                .on_click((_event, cx) => this.setFilter(id, cx))
                .child(caption),
            ),
          ),
      )
      .child(
        h_flex()
          .items_center()
          .gap(SPACE.xs)
          .children(
            SORTS.map(([id, caption]) =>
              Button.new(`todo-sort-${id}`)
                .h(22)
                .px(SPACE.xs)
                .text_size(10)
                .text_color(this.sort === id ? colors.foreground : colors.muted_foreground)
                .on_click((_event, cx) => this.setSort(id, cx))
                .child(caption),
            ),
          ),
      );
  }
}

// Older records predate priority and timestamps; fill them in on read so a
// list stored by a previous version keeps working.
function normalizeItem(item) {
  return {
    id: item.id,
    caption: item.caption,
    done: Boolean(item.done),
    priority: item.priority || "normal",
    createdAt: item.createdAt || Date.now(),
    doneAt: item.doneAt || null,
  };
}

// A short age for the row's second line: minutes, hours, days.
function relativeTime(at, done) {
  if (!at) return "";
  const minutes = Math.floor((Date.now() - at) / 60000);
  let span;
  if (minutes < 1) span = "just now";
  else if (minutes < 60) span = `${minutes}m ago`;
  else if (minutes < 60 * 24) span = `${Math.floor(minutes / 60)}h ago`;
  else span = `${Math.floor(minutes / (60 * 24))}d ago`;
  return done ? `done ${span}` : `added ${span}`;
}
