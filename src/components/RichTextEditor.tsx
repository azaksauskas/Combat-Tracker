import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import clsx from "clsx";

interface Props {
  value: string;
  onChange: (html: string) => void;
  label: string;
}

export function RichTextEditor({ value, onChange, label }: Props) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, codeBlock: false, blockquote: false })],
    content: value,
    editorProps: {
      attributes: {
        "aria-label": label,
        class: "rich-text min-h-16 max-h-40 overflow-y-auto p-2 text-sm text-strong outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      list: editor?.isActive("bulletList") ?? false,
    }),
  });

  const tool = (on: boolean) =>
    clsx("rounded px-2 py-0.5 text-xs text-muted hover:bg-surface-3", on && "bg-surface-3 text-strong");

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface-2">
      <div className="flex gap-1 border-b border-line bg-surface p-1">
        <button type="button" className={clsx(tool(active.bold), "font-bold")} onClick={() => editor?.chain().focus().toggleBold().run()}>
          B
        </button>
        <button type="button" className={clsx(tool(active.italic), "italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          I
        </button>
        <button type="button" className={tool(active.list)} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          • List
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
