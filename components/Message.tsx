import React from "react";
import ReactMarkdown from "react-markdown";

export default function Message({
  role,
  content,
}: {
  role: string;
  content: string;
}) {
  const isUser = role === "user";

  return (
    <div
      className={`flex w-full gap-3 ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
      style={{ animation: "var(--animate-fade-up)" }}
    >
      {/* Avatar */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
          isUser
            ? "glass text-accent"
            : "accent-grad on-accent accent-shadow"
        }`}
      >
        {isUser ? "You" : "AI"}
      </div>

      {/* Bubble */}
      <div
        className={`message-markdown max-w-[80%] rounded-2xl px-5 py-3.5 ${
          isUser
            ? "accent-grad on-accent accent-shadow rounded-tr-sm"
            : "glass-strong text-strong rounded-tl-sm"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        ) : (
          <ReactMarkdown>{content}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}
