import { KeyRound, LogOut, Settings } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ShellUser = { name: string; subtitle?: string };

interface UserMenuProps {
  user: ShellUser;
  onOpenSettings: () => void;
  onChangePassword: () => void;
  onSignOut: () => void | Promise<void>;
}

export function UserMenu({ user, onOpenSettings, onChangePassword, onSignOut }: UserMenuProps) {
  const { t } = useTranslation();
  const { t: tAuth } = useTranslation("auth");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={t("USRMENU")} className="h-10 gap-2 px-1.5" variant="ghost">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                {user.name.slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden flex-col items-start leading-tight sm:flex">
              <span className="text-sm font-semibold">{user.name}</span>
              {user.subtitle ? <span className="text-xs text-muted-foreground">{user.subtitle}</span> : null}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52" sideOffset={6}>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {user.subtitle ?? user.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onOpenSettings}>
            <Settings aria-hidden="true" className="mr-2 size-4" />
            {t("USRSET")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onChangePassword}>
            <KeyRound aria-hidden="true" className="mr-2 size-4" />
            {t("USRPWD")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(event) => {
              event.preventDefault();
              setConfirmOpen(true);
            }}
          >
            <LogOut aria-hidden="true" className="mr-2 size-4" />
            {t("USRSGOUT")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        confirmLabel={tAuth("LOTCA")}
        description={tAuth("LOTCM")}
        isProcessing={signingOut}
        open={confirmOpen}
        title={tAuth("LOTCT")}
        variant="destructive"
        onConfirm={async () => {
          setSigningOut(true);
          try {
            await onSignOut();
          } finally {
            setSigningOut(false);
            setConfirmOpen(false);
          }
        }}
        onOpenChange={setConfirmOpen}
      />
    </>
  );
}
