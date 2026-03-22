"use client";

import { useRef, useEffect, useCallback } from "react";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
};

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "내용을 입력하세요.",
  minHeight = "200px",
  className = "",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalRef = useRef(false);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (isInternalRef.current) {
      isInternalRef.current = false;
      return;
    }
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  const emit = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? "";
    isInternalRef.current = true;
    onChange(html);
  }, [onChange]);

  const cmd = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    emit();
  };

  const insertImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        cmd("insertImage", dataUrl);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <div className={`border border-gray-200 rounded-lg overflow-hidden bg-white ${className}`}>
      <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 bg-gray-50">
        <button
          type="button"
          onClick={() => cmd("bold")}
          className="px-2 py-1 text-sm font-bold border border-gray-200 rounded hover:bg-gray-100"
          title="굵게"
          aria-label="굵게"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => cmd("italic")}
          className="px-2 py-1 text-sm italic border border-gray-200 rounded hover:bg-gray-100"
          title="기울임"
          aria-label="기울임"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => cmd("underline")}
          className="px-2 py-1 text-sm underline border border-gray-200 rounded hover:bg-gray-100"
          title="밑줄"
          aria-label="밑줄"
        >
          U
        </button>
        <span className="w-px bg-gray-200 self-stretch mx-0.5" />
        <select
          className="text-sm border border-gray-200 rounded px-2 py-1 bg-white"
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            if (v === "small") cmd("fontSize", "1");
            else if (v === "large") cmd("fontSize", "5");
            else if (v === "xlarge") cmd("fontSize", "7");
          }}
        >
          <option value="">글자 크기</option>
          <option value="small">작게</option>
          <option value="large">크게</option>
          <option value="xlarge">매우 크게</option>
        </select>
        <span className="w-px bg-gray-200 self-stretch mx-0.5" />
        <button
          type="button"
          onClick={insertImage}
          className="px-2 py-1 text-sm border border-gray-200 rounded hover:bg-gray-100"
          title="이미지 삽입"
          aria-label="이미지 삽입"
        >
          🖼 이미지
        </button>
        <button
          type="button"
          onClick={() => cmd("insertUnorderedList")}
          className="px-2 py-1 text-sm border border-gray-200 rounded hover:bg-gray-100"
          title="글머리 기호"
        >
          • 목록
        </button>
        <button
          type="button"
          onClick={() => cmd("insertOrderedList")}
          className="px-2 py-1 text-sm border border-gray-200 rounded hover:bg-gray-100"
          title="번호 목록"
        >
          1. 목록
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        className="rich-editor-content p-3 outline-none prose prose-sm max-w-none"
        style={{ minHeight }}
        data-placeholder={placeholder}
        onInput={emit}
        onPaste={(e) => {
          if (e.clipboardData.files.length) {
            e.preventDefault();
            const file = e.clipboardData.files[0];
            if (!file.type.startsWith("image/")) return;
            const reader = new FileReader();
            reader.onload = () => cmd("insertImage", reader.result as string);
            reader.readAsDataURL(file);
          }
        }}
        suppressContentEditableWarning
      />
    </div>
  );
}
