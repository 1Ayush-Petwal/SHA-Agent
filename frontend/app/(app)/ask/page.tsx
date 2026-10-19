import type { Metadata } from "next";
import { Suspense } from "react";
import { Chat } from "@/components/chat/chat";

export const metadata: Metadata = { title: "Ask" };

export default function AskPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}
