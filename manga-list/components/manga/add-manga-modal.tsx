import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StarRating } from "@/components/ui/star-rating";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiRequest, getApiErrorMessage } from "@/lib/api-client";

type MangaListStatus = "READING" | "COMPLETED" | "PLAN_TO_READ" | "DROPPED";

interface Manga {
  mal_id: number;
  anilist_id?: number;
  title: string;
  title_english?: string;
  images: {
    jpg: {
      large_image_url: string;
    };
  };
}

interface AddMangaModalProps {
  manga: Manga;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "add" | "edit";
  initialData?: {
    status: MangaListStatus;
    rating: number;
    currentChapter: string;
    notes: string;
  };
  userMangaId?: string;
  onSuccess?: () => void;
}

const DEFAULT_FORM_DATA: {
  status: MangaListStatus;
  rating: number;
  currentChapter: string;
  notes: string;
} = {
  status: "READING",
  rating: 0,
  currentChapter: "",
  notes: "",
};

export function AddMangaModal({
  manga,
  open,
  onOpenChange,
  mode = "add",
  initialData,
  userMangaId,
  onSuccess,
}: AddMangaModalProps) {
  const t = useTranslations("AddManga");
  const tTrack = useTranslations("MyTrack");
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);

  const formatRating = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

  // Reset or pre-fill form when modal opens
  useEffect(() => {
    if (open) {
      if (mode === "edit" && initialData) {
        setFormData({
          status: initialData.status,
          rating: initialData.rating || 0,
          currentChapter: initialData.currentChapter || "",
          notes: initialData.notes || "",
        });
      } else {
        setFormData(DEFAULT_FORM_DATA);
      }
    }
  }, [open, mode, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error("You must be logged in");
      return;
    }

    setIsLoading(true);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const payload: {
        status: MangaListStatus;
        malId?: number;
        anilistId?: number;
        rating?: number;
        currentChapter?: number;
        notes?: string;
      } = {
        status: formData.status,
      };

      if (mode === "add") {
        payload.malId = manga.mal_id;
        if (typeof manga.anilist_id === "number") {
          payload.anilistId = manga.anilist_id;
        }
      }

      // Add optional fields
      if (formData.rating > 0) payload.rating = formData.rating;
      if (formData.currentChapter)
        payload.currentChapter = parseInt(formData.currentChapter);
      if (formData.notes) payload.notes = formData.notes;

      if (mode === "edit" && !userMangaId) {
        throw new Error("Missing manga entry id");
      }

      const endpoint =
        mode === "add" ? "/manga/list" : `/manga/list/${userMangaId}`;
      const method = mode === "add" ? "POST" : "PATCH";

      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 10000);

      await apiRequest(endpoint, {
        method,
        csrf: "authenticated-required",
        body: payload,
        signal: controller.signal,
      });

      toast.success(
        mode === "add" ? t("success") : "Manga updated successfully!",
      );
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        toast.error("Request timed out. Please try again.");
      } else {
        toast.error(getApiErrorMessage(error, t("error")));
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? tTrack("edit.title") : t("title")}
          </DialogTitle>
          <DialogDescription className="line-clamp-1">
            {manga.title}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">{t("status.label")}</Label>
            <Select
              value={formData.status}
              onValueChange={(value: MangaListStatus) =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="READING">{t("status.reading")}</SelectItem>
                <SelectItem value="COMPLETED">
                  {t("status.completed")}
                </SelectItem>
                <SelectItem value="PLAN_TO_READ">
                  {t("status.planToRead")}
                </SelectItem>
                <SelectItem value="DROPPED">{t("status.dropped")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Rating */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              {t("rating.label")}
              <span className="text-sm text-muted-foreground font-normal">
                ({formData.rating > 0 ? formatRating(formData.rating) : "-"} / 10)
              </span>
            </Label>
            <StarRating
              value={formData.rating / 2}
              onChange={(rating) =>
                setFormData({ ...formData, rating: rating * 2 })
              }
            />
          </div>

          {/* Current Chapter */}
          <div className="space-y-2">
            <Label htmlFor="currentChapter">{t("currentChapter.label")}</Label>
            <Input
              id="currentChapter"
              type="number"
              min="0"
              placeholder={t("currentChapter.placeholder")}
              value={formData.currentChapter}
              onChange={(e) =>
                setFormData({ ...formData, currentChapter: e.target.value })
              }
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">{t("notes.label")}</Label>
            <Textarea
              id="notes"
              placeholder={t("notes.placeholder")}
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="min-w-[100px]"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : mode === "edit" ? (
                t("actions.save")
              ) : (
                t("actions.add")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
