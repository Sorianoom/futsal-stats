"use client";

import { useState } from "react";

import { HalfCourt } from "@/components/half-court";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EMPTY_GOAL_DETAIL,
  GOAL_TAGS,
  MAX_GOAL_TAGS,
  goalTagLabel,
  toggleTag,
  type GoalDetail,
} from "@/lib/match/goal-detail";
import { cn } from "@/lib/utils";

interface GoalDetailFormProps {
  forTeam: boolean;
  initial: GoalDetail;
  saveLabel: string;
  /** Sin él no se ofrece guardar sin detalle (al corregir, basta con no marcar nada). */
  skipLabel?: string;
  saving: boolean;
  error: string | null;
  onSave: (detail: GoalDetail) => void;
}

function GoalDetailForm({ forTeam, initial, saveLabel, skipLabel, saving, error, onSave }: GoalDetailFormProps) {
  const [detail, setDetail] = useState<GoalDetail>(initial);
  const full = detail.goal_tags.length >= MAX_GOAL_TAGS;
  const point = detail.goal_x !== null && detail.goal_y !== null ? { x: detail.goal_x, y: detail.goal_y } : null;

  return (
    <>
      <div role="group" aria-label="Tipo de gol" className="space-y-2">
        <p className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
          {`Tipo de gol · hasta ${MAX_GOAL_TAGS}`}
        </p>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {GOAL_TAGS.map((tag) => {
            const pressed = detail.goal_tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={pressed}
                disabled={!pressed && full}
                onClick={() => setDetail((current) => ({ ...current, goal_tags: toggleTag(current.goal_tags, tag) }))}
                className={cn(
                  "min-h-9 rounded-full border px-2.5 text-[13px] font-bold sm:min-h-10 sm:px-3 sm:text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40",
                  pressed ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                {goalTagLabel(tag, forTeam)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
            Desde dónde · toca la pista
          </p>
          {point ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDetail((current) => ({ ...current, goal_x: null, goal_y: null }))}
            >
              Quitar punto
            </Button>
          ) : null}
        </div>
        <HalfCourt
          label={forTeam ? "Media pista del rival: toca desde dónde marcamos" : "Nuestra media pista: toca desde dónde nos marcaron"}
          selected={point}
          onPick={(picked) => setDetail((current) => ({ ...current, goal_x: picked.x, goal_y: picked.y }))}
          className="mx-auto max-w-48 sm:max-w-64"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        {skipLabel ? (
          <Button variant="outline" size="lg" disabled={saving} onClick={() => onSave(EMPTY_GOAL_DETAIL)}>
            {skipLabel}
          </Button>
        ) : null}
        <Button size="lg" disabled={saving} onClick={() => onSave(detail)}>
          {saveLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

interface GoalDetailDialogProps {
  /** null: cerrado. */
  goal: { forTeam: boolean; title: string; initial?: GoalDetail } | null;
  saveLabel: string;
  skipLabel?: string;
  saving?: boolean;
  error?: string | null;
  onSave: (detail: GoalDetail) => void;
  onClose: () => void;
}

/** Tipo de gol y punto de la pista, ambos opcionales. Cerrar la ventana no anota nada. */
export function GoalDetailDialog({
  goal,
  saveLabel,
  skipLabel,
  saving = false,
  error = null,
  onSave,
  onClose,
}: GoalDetailDialogProps) {
  return (
    <Dialog open={goal !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{goal?.title ?? "Gol"}</DialogTitle>
          <DialogDescription>Opcional: cómo fue y desde dónde.</DialogDescription>
        </DialogHeader>
        {goal ? (
          <GoalDetailForm
            forTeam={goal.forTeam}
            initial={goal.initial ?? EMPTY_GOAL_DETAIL}
            saveLabel={saveLabel}
            skipLabel={skipLabel}
            saving={saving}
            error={error}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
