"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Disclosure } from "@/components/disclosure";
import { Button } from "@/components/ui/button";

export function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Disclosure title="SQL">
      <div className="relative">
        <Button
          size="xs"
          variant="ghost"
          className="absolute top-2 right-2"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(sql);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // Clipboard blocked (insecure context or denied): the SQL is still selectable.
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <pre className="overflow-x-auto p-3 pr-20 font-mono text-xs leading-relaxed">
          <code>{sql}</code>
        </pre>
      </div>
    </Disclosure>
  );
}
