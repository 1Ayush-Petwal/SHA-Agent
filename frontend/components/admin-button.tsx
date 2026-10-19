"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAdminToken } from "@/lib/admin";

export function AdminButton() {
  const [token, setToken] = useAdminToken();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setDraft("");
      }}
    >
      <DialogTrigger
        render={
          // Icon-only below sm: square it to match the theme toggle beside it.
          <Button variant={token ? "secondary" : "ghost"} size="sm" className="max-sm:has-data-[icon=inline-start]:px-[7px]" />
        }
      >
        <KeyRound data-icon="inline-start" />
        <span className="max-sm:sr-only">{token ? "Admin" : "Admin token"}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Admin token</DialogTitle>
          <DialogDescription>
            Kept in this browser only and sent with admin requests. It shows the save-to-memory and run-evals controls;
            the server still checks it.
          </DialogDescription>
        </DialogHeader>
        {token ? (
          <p className="text-sm">A token is saved in this browser.</p>
        ) : (
          <form
            id="admin-token"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              setToken(draft);
              setOpen(false);
            }}
          >
            <Input
              type="password"
              autoComplete="off"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste the admin token"
              aria-label="Admin token"
            />
          </form>
        )}
        <DialogFooter>
          {token ? (
            <Button
              variant="destructive"
              onClick={() => {
                setToken(null);
                setOpen(false);
              }}
            >
              Forget token
            </Button>
          ) : (
            <Button type="submit" form="admin-token" disabled={!draft.trim()}>
              Save token
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
