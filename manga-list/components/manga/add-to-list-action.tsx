"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddMangaModal, type AddToListManga } from "@/components/manga/add-manga-modal";

type AddToListActionProps = {
  manga: AddToListManga;
  isInList?: boolean;
  disabled?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  onSuccess?: () => void;
};

export function AddToListAction({
  manga,
  isInList = false,
  disabled = false,
  size = "sm",
  className,
  onSuccess,
}: AddToListActionProps) {
  const t = useTranslations("Browse");
  const [isOpen, setIsOpen] = useState(false);

  const isDisabled = disabled || isInList;
  const label = useMemo(
    () => (isInList ? t("alreadyInList") : t("addToList")),
    [isInList, t],
  );

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={isInList ? "secondary" : "default"}
        disabled={isDisabled}
        className={className}
        onClick={(event) => {
          event.stopPropagation();
          if (!isDisabled) {
            setIsOpen(true);
          }
        }}
      >
        {isInList ? <Check className="size-4" /> : <Plus className="size-4" />}
        {label}
      </Button>

      <AddMangaModal
        manga={manga}
        open={isOpen}
        onOpenChange={setIsOpen}
        onSuccess={onSuccess}
      />
    </>
  );
}
