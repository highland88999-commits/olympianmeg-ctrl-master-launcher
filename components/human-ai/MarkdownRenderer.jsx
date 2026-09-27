'use client';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const CodeBlock = ({ language, codeString, onPreview, props }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-header">
        <span>{language.toUpperCase()}</span>
        <div className="code-actions">
          <button className="action-btn copy-btn" onClick={handleCopy}>
            {copied ? '✔ COPIED' : '📋 COPY'}
          </button>
          {(language === 'html' || language === 'javascript') && onPreview && (
            <button className="action-btn run-preview-btn" onClick={() => onPreview(codeString)}>
              ▶ RUN PREVIEW
            </button>
          )}
        </div>
      </div>
      <SyntaxHighlighter
        {...props}
        style={vscDarkPlus}
        language={language}
        PreTag="div"
        className="syntax-highlighter"
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
};

export default function MarkdownRenderer({ content, onPreview }) {
  return (
    <ReactMarkdown
      className="markdown-body"
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';
          const codeString = String(children).replace(/\n$/, '');
          
          return !inline && match ? (
            <CodeBlock 
              language={language} 
              codeString={codeString} 
              onPreview={onPreview} 
              props={props} 
            />
          ) : (
            <code {...props} className="inline-code">
              {children}
            </code>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}


