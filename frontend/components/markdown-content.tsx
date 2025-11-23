"use client"

import React from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import rehypeRaw from "rehype-raw"

type MarkdownCodeProps = React.HTMLAttributes<HTMLElement> & {
  inline?: boolean
}

const headingClasses: Record<string, string> = {
  h1: "text-3xl md:text-4xl font-bold text-foreground mt-12 mb-6",
  h2: "text-2xl md:text-3xl font-semibold text-foreground mt-10 mb-5",
  h3: "text-xl md:text-2xl font-semibold text-foreground mt-8 mb-4",
  h4: "text-lg md:text-xl font-semibold text-foreground mt-8 mb-3",
}

const markdownComponents: Components = {
  a: ({ node, className, ...props }) => (
    <a
      {...props}
      className={[
        "text-primary underline decoration-dotted underline-offset-4 hover:text-primary/80",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      target={props.target ?? "_blank"}
      rel={props.rel ?? "noreferrer"}
    />
  ),
  blockquote: ({ node, className, ...props }) => (
    <blockquote
      {...props}
      className={[
        "border-l-4 border-primary/60 pl-4 italic text-foreground/80 bg-primary/5 py-3 rounded-r my-8",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  ),
  p: ({ node, className, ...props }) => (
    <p
      {...props}
      className={["text-foreground/80 leading-relaxed my-6 text-base md:text-lg", className].filter(Boolean).join(" ")}
    />
  ),
  h1: ({ node, className, ...props }) => (
    <h1 {...props} className={[headingClasses.h1, className].filter(Boolean).join(" ")} />
  ),
  h2: ({ node, className, ...props }) => (
    <h2 {...props} className={[headingClasses.h2, className].filter(Boolean).join(" ")} />
  ),
  h3: ({ node, className, ...props }) => (
    <h3 {...props} className={[headingClasses.h3, className].filter(Boolean).join(" ")} />
  ),
  h4: ({ node, className, ...props }) => (
    <h4 {...props} className={[headingClasses.h4, className].filter(Boolean).join(" ")} />
  ),
  ul: ({ node, className, ...props }) => (
    <ul
      {...props}
      className={["list-disc pl-6 md:pl-8 space-y-2 my-6 text-foreground/80", className].filter(Boolean).join(" ")}
    />
  ),
  ol: ({ node, className, ...props }) => (
    <ol
      {...props}
      className={["list-decimal pl-6 md:pl-8 space-y-2 my-6 text-foreground/80", className].filter(Boolean).join(" ")}
    />
  ),
  li: ({ node, className, ...props }) => (
    <li {...props} className={["leading-relaxed text-base md:text-lg", className].filter(Boolean).join(" ")} />
  ),
  code({ inline, className, children, ...props }: MarkdownCodeProps) {
    if (inline) {
      return (
        <code
          {...props}
          className={[
            "px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[0.95em]",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </code>
      )
    }

    return (
      <pre className="bg-card/60 border border-border/50 rounded-lg p-4 overflow-x-auto text-sm">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    )
  },
  hr: ({ node, className, ...props }) => (
    <hr {...props} className={["border-border/60 my-10", className].filter(Boolean).join(" ")} />
  ),
  table: ({ node, className, ...props }) => (
    <div className="overflow-x-auto my-8">
      <table
        {...props}
        className={["w-full border-collapse text-sm", className].filter(Boolean).join(" ")}
      />
    </div>
  ),
  th: ({ node, className, ...props }) => (
    <th
      {...props}
      className={[
        "border border-border/60 px-3 py-2 text-left bg-foreground/10 font-semibold text-foreground",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  ),
  td: ({ node, className, ...props }) => (
    <td
      {...props}
      className={["border border-border/60 px-3 py-2 align-top text-foreground/90", className]
        .filter(Boolean)
        .join(" ")}
    />
  ),
  img: ({ node, className, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={typeof alt === "string" ? alt : ""}
      className={["rounded-lg border border-border/40 shadow-md my-8", className].filter(Boolean).join(" ")}
      loading="lazy"
    />
  ),
}

interface MarkdownContentProps {
  content?: string | null
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  if (!content?.trim()) {
    return null
  }

  return (
    <div className="max-w-3xl mx-auto text-base md:text-lg leading-relaxed text-foreground/80">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
