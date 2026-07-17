"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { moveDealStageAction } from "@/lib/crm/actions";
import type { CrmDeal, CrmPipelineStage } from "@/lib/types/crm";

function DealCard({
  deal,
  contactLabel,
}: {
  deal: CrmDeal;
  contactLabel?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id, data: { type: "deal", stage: deal.stage } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-lg border bg-background p-3 text-sm active:cursor-grabbing"
    >
      <p className="font-medium">{deal.name}</p>
      <p className="text-xs text-muted-foreground">
        £{(deal.value_pence / 100).toFixed(0)}
        {contactLabel ? ` · ${contactLabel}` : ""}
        {deal.expected_close ? ` · close ${deal.expected_close}` : ""}
      </p>
      {deal.stalled_since ? (
        <p className="mt-1 text-xs text-amber-700">Stalled</p>
      ) : null}
    </div>
  );
}

function Column({
  stage,
  deals,
  contactMap,
}: {
  stage: CrmPipelineStage;
  deals: CrmDeal[];
  contactMap: Map<string, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: "column", stage: stage.id },
  });
  const ids = deals.map((d) => d.id);

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[320px] w-64 shrink-0 flex-col rounded-xl border p-3 ${
        isOver ? "border-teal-600 bg-teal-50/40" : "bg-muted/20"
      }`}
    >
      <p className="mb-3 text-sm font-medium">
        {stage.name}{" "}
        <span className="text-muted-foreground">({deals.length})</span>
      </p>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              contactLabel={contactMap.get(deal.contact_id)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function DealKanban({
  stages,
  deals: initialDeals,
  contactMap,
}: {
  stages: CrmPipelineStage[];
  deals: CrmDeal[];
  contactMap: Record<string, string>;
}) {
  const [deals, setDeals] = useState(initialDeals);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const contacts = useMemo(
    () => new Map(Object.entries(contactMap)),
    [contactMap],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const activeDeal = deals.find((d) => d.id === activeId) ?? null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const dealId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;

    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;

    const stageIds = new Set(stages.map((s) => s.id));
    let targetStage = stageIds.has(overId) ? overId : undefined;
    if (!targetStage) {
      const overDeal = deals.find((d) => d.id === overId);
      targetStage = overDeal?.stage;
    }
    if (!targetStage || targetStage === deal.stage) return;

    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stage: targetStage! } : d)),
    );

    startTransition(async () => {
      const result = await moveDealStageAction(dealId, targetStage!);
      if (result.error) setDeals(initialDeals);
    });
  }

  return (
    <div className="space-y-2">
      {pending ? (
        <p className="text-xs text-muted-foreground">Saving stage…</p>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              deals={deals.filter((d) => d.stage === stage.id)}
              contactMap={contacts}
            />
          ))}
        </div>
        <DragOverlay>
          {activeDeal ? (
            <div className="w-60 rounded-lg border bg-background p-3 text-sm shadow-lg">
              <p className="font-medium">{activeDeal.name}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
