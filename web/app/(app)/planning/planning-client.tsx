"use client"

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { format, parseISO, addDays } from "date-fns"
import { fr } from "date-fns/locale"
import {
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Plus,
  SkipForward,
  Trash2,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useOptimistic, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MANUAL_SPORTS } from "@/lib/constants/sports"
import {
  SESSION_TEMPLATES,
  TEMPLATE_BY_SPORT,
  type SessionTemplate,
} from "@/lib/constants/session-templates"
import { cn } from "@/lib/utils"
import {
  createPlannedSession,
  deletePlannedSession,
  movePlannedSession,
} from "./actions"

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlannedSession = {
  id: string
  planned_date: string
  sport_type: string
  session_type: string
  planned_duration_min: number | null
  description: string | null
  status: "planned" | "completed" | "skipped" | "modified"
  actual_activity_id: string | null
  completion_score: number | null
}

export type ActivitySummary = {
  id: string
  name: string | null
  sport_type: string
  start_date: string
  duration_sec: number | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPORT_EMOJIS: Record<string, string> = {
  Run: "🏃", Trail: "⛰️", Ride: "🚴", Swim: "🏊", WeightTraining: "💪",
  Yoga: "🧘", Workout: "🏋️", Hike: "🥾", Walk: "🚶", AlpineSki: "⛷️",
  Football: "⚽", Tennis: "🎾", Climbing: "🧗", Rowing: "🚣", Other: "🏅",
  VirtualRide: "🚴", NordicSki: "🎿",
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  planned: { label: "Planifiée", className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", icon: <Clock className="h-3 w-3" /> },
  completed: { label: "Réalisée", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", icon: <CheckCircle className="h-3 w-3" /> },
  skipped: { label: "Ignorée", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400", icon: <SkipForward className="h-3 w-3" /> },
  modified: { label: "Modifiée", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", icon: <Clock className="h-3 w-3" /> },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(min: number | null): string {
  if (!min) return ""
  if (min >= 60) return `${Math.floor(min / 60)}h${(min % 60).toString().padStart(2, "0")}`
  return `${min}min`
}

function weekDays(weekStart: string): string[] {
  const start = parseISO(weekStart)
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "yyyy-MM-dd"))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SessionCard({
  session,
  onDelete,
  isDragging = false,
}: {
  session: PlannedSession
  onDelete: (id: string) => void
  isDragging?: boolean
}) {
  const status = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.planned
  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card p-2 text-xs shadow-sm",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1 font-medium truncate">
          <span>{SPORT_EMOJIS[session.sport_type] ?? "🏅"}</span>
          <span className="truncate capitalize">{session.session_type.replace("_", " ")}</span>
        </div>
        <button
          onClick={() => onDelete(session.id)}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          aria-label="Supprimer"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {session.planned_duration_min && (
        <p className="mt-0.5 text-muted-foreground">{formatDuration(session.planned_duration_min)}</p>
      )}
      <div className={cn("mt-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5", status.className)}>
        {status.icon}
        <span>{status.label}</span>
        {session.status === "completed" && session.completion_score != null && (
          <span className="ml-0.5">· {Math.round(session.completion_score)}%</span>
        )}
      </div>
    </div>
  )
}

function DraggableSessionCard({
  session,
  onDelete,
}: {
  session: PlannedSession
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: session.id,
    data: { date: session.planned_date },
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="touch-none">
      <SessionCard session={session} onDelete={onDelete} isDragging={isDragging} />
    </div>
  )
}

function DroppableDay({
  dayKey,
  children,
}: {
  dayKey: string
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[120px] flex-col gap-1.5 rounded-md p-1 transition-colors",
        isOver && "bg-primary/5 ring-1 ring-primary/30",
      )}
    >
      {children}
    </div>
  )
}

// ─── Create session dialog ────────────────────────────────────────────────────

function CreateSessionDialog({
  open,
  dayKey,
  onClose,
  onCreated,
}: {
  open: boolean
  dayKey: string | null
  onClose: () => void
  onCreated: (session: PlannedSession) => void
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<SessionTemplate | null>(null)
  const [sport, setSport] = useState("Run")
  const [sessionType, setSessionType] = useState("")
  const [duration, setDuration] = useState("")
  const [description, setDescription] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function applyTemplate(t: SessionTemplate) {
    setSelectedTemplate(t)
    setSport(t.sport_type)
    setSessionType(t.session_type)
    setDuration(String(t.default_duration_min))
    setDescription(t.description)
  }

  function resetAndClose() {
    setSelectedTemplate(null)
    setSport("Run")
    setSessionType("")
    setDuration("")
    setDescription("")
    setError(null)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dayKey) return
    setError(null)

    const payload = {
      planned_date: dayKey,
      sport_type: sport,
      session_type: sessionType || "free",
      planned_duration_min: duration ? parseInt(duration, 10) : null,
      description: description || null,
    }

    startTransition(async () => {
      const result = await createPlannedSession(payload)
      if (result.error) {
        setError(result.error)
        return
      }
      onCreated({
        id: crypto.randomUUID(),
        status: "planned",
        actual_activity_id: null,
        completion_score: null,
        ...payload,
      })
      resetAndClose()
    })
  }

  const templatesForSport = TEMPLATE_BY_SPORT[sport] ?? []

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Nouvelle séance —{" "}
            {dayKey ? format(parseISO(dayKey), "EEEE d MMMM", { locale: fr }).replace(/^\w/, (c) => c.toUpperCase()) : ""}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Sport selector */}
          <div className="space-y-1.5">
            <Label>Sport</Label>
            <div className="flex flex-wrap gap-1.5">
              {MANUAL_SPORTS.slice(0, 8).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { setSport(s.key); setSelectedTemplate(null); setSessionType("") }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    sport === s.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50",
                  )}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template selector */}
          {templatesForSport.length > 0 && (
            <div className="space-y-1.5">
              <Label>Modèle de séance</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {templatesForSport.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className={cn(
                      "rounded-lg border p-2 text-left text-xs transition-colors",
                      selectedTemplate?.id === t.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    <p className="font-medium">{t.label}</p>
                    <p className="text-muted-foreground">{t.default_duration_min}min</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="duration">Durée (min)</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                placeholder="45"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="session-type">Type de séance</Label>
              <Input
                id="session-type"
                placeholder="endurance, seuil…"
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              rows={3}
              placeholder="Détails de la séance…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetAndClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Création…" : "Créer la séance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PlanningClient({
  weekStart,
  sessions: initialSessions,
  activities,
}: {
  weekStart: string
  sessions: PlannedSession[]
  activities: ActivitySummary[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogDay, setDialogDay] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const [optimisticSessions, applyOptimistic] = useOptimistic(
    initialSessions,
    (
      state: PlannedSession[],
      action:
        | { type: "move"; id: string; newDate: string }
        | { type: "delete"; id: string }
        | { type: "add"; session: PlannedSession },
    ) => {
      if (action.type === "move") {
        return state.map((s) => s.id === action.id ? { ...s, planned_date: action.newDate } : s)
      }
      if (action.type === "delete") {
        return state.filter((s) => s.id !== action.id)
      }
      if (action.type === "add") {
        return [...state, action.session]
      }
      return state
    },
  )

  const days = weekDays(weekStart)
  const today = new Date().toISOString().slice(0, 10)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  // ── Navigation ──────────────────────────────────────────────────────────────
  function navigate(direction: -1 | 1) {
    const start = parseISO(weekStart)
    const next = addDays(start, direction * 7)
    router.push(`/planning?week=${format(next, "yyyy-MM-dd")}`)
  }

  // ── Drag handlers ────────────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null)
    const { active, over } = event
    if (!over) return
    const sourceDate = active.data.current?.date as string
    const targetDate = String(over.id)
    if (sourceDate === targetDate) return

    startTransition(async () => {
      applyOptimistic({ type: "move", id: String(active.id), newDate: targetDate })
      await movePlannedSession(String(active.id), targetDate)
    })
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  function handleDelete(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "delete", id })
      await deletePlannedSession(id)
    })
  }

  // ── Add (optimistic) ─────────────────────────────────────────────────────────
  function handleSessionCreated(session: PlannedSession) {
    applyOptimistic({ type: "add", session })
  }

  // ── Session map by day ───────────────────────────────────────────────────────
  const sessionsByDay = Object.fromEntries(
    days.map((d) => [d, optimisticSessions.filter((s) => s.planned_date === d)]),
  )
  const activitiesByDay = Object.fromEntries(
    days.map((d) => [
      d,
      activities.filter((a) => a.start_date.slice(0, 10) === d),
    ]),
  )

  const activeDragSession = activeDragId
    ? optimisticSessions.find((s) => s.id === activeDragId)
    : null

  const weekLabel = `${format(parseISO(days[0]), "d MMM", { locale: fr })} – ${format(parseISO(days[6]), "d MMM yyyy", { locale: fr })}`

  return (
    <>
      {/* Header navigation */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Planning</h1>
          <p className="text-sm text-muted-foreground capitalize">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} disabled={isPending}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/planning?week=${format(new Date(), "yyyy-MM-dd")}`)}
            disabled={isPending}
          >
            Aujourd&apos;hui
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(1)} disabled={isPending}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Desktop: 7-column grid ───────────────────────────────────────────── */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="hidden md:grid md:grid-cols-7 md:gap-2">
          {days.map((dayKey) => {
            const daySessions = sessionsByDay[dayKey] ?? []
            const dayActivities = activitiesByDay[dayKey] ?? []
            const isToday = dayKey === today
            const dayLabel = format(parseISO(dayKey), "EEE d", { locale: fr })
            const dayLabelCapitalized = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)

            return (
              <div key={dayKey} className="flex flex-col gap-1">
                {/* Day header */}
                <div
                  className={cn(
                    "rounded-md px-1.5 py-1 text-center text-xs font-medium",
                    isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {dayLabelCapitalized}
                </div>

                {/* Droppable area */}
                <DroppableDay dayKey={dayKey}>
                  {daySessions.map((session) => (
                    <DraggableSessionCard
                      key={session.id}
                      session={session}
                      onDelete={handleDelete}
                    />
                  ))}

                  {/* Completed activities */}
                  {dayActivities.map((activity) => (
                    <Link
                      key={activity.id}
                      href={`/activities/${activity.id}`}
                      className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    >
                      <CheckCircle className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {SPORT_EMOJIS[activity.sport_type] ?? "🏅"}{" "}
                        {activity.name ?? activity.sport_type}
                      </span>
                    </Link>
                  ))}
                </DroppableDay>

                {/* Add button */}
                <button
                  onClick={() => setDialogDay(dayKey)}
                  className="flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Ajouter
                </button>
              </div>
            )
          })}
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeDragSession && (
            <div className="rotate-2 shadow-lg opacity-90 w-36">
              <SessionCard session={activeDragSession} onDelete={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* ── Mobile: stacked day cards ────────────────────────────────────────── */}
      <div className="space-y-2 md:hidden">
        {days.map((dayKey) => {
          const daySessions = sessionsByDay[dayKey] ?? []
          const dayActivities = activitiesByDay[dayKey] ?? []
          const isToday = dayKey === today
          const isExpanded = expandedDays.has(dayKey) || isToday
          const totalItems = daySessions.length + dayActivities.length
          const dayLabel = format(parseISO(dayKey), "EEEE d MMMM", { locale: fr })
          const dayLabelCapitalized = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)

          return (
            <div key={dayKey} className={cn("rounded-lg border bg-card", isToday && "border-primary/50")}>
              {/* Accordion header */}
              <button
                className="flex w-full items-center justify-between px-4 py-3"
                onClick={() =>
                  setExpandedDays((prev) => {
                    const next = new Set(prev)
                    if (next.has(dayKey)) next.delete(dayKey)
                    else next.add(dayKey)
                    return next
                  })
                }
              >
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-medium", isToday && "text-primary")}>
                    {dayLabelCapitalized}
                  </span>
                  {totalItems > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {totalItems}
                    </span>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {/* Accordion body */}
              {isExpanded && (
                <div className="space-y-2 border-t px-4 pb-3 pt-2">
                  {daySessions.map((session) => (
                    <SessionCard key={session.id} session={session} onDelete={handleDelete} />
                  ))}
                  {dayActivities.map((activity) => (
                    <Link
                      key={activity.id}
                      href={`/activities/${activity.id}`}
                      className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    >
                      <CheckCircle className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {SPORT_EMOJIS[activity.sport_type] ?? "🏅"}{" "}
                        {activity.name ?? activity.sport_type}
                      </span>
                    </Link>
                  ))}
                  {totalItems === 0 && (
                    <p className="text-xs text-muted-foreground">Aucune séance prévue</p>
                  )}
                  <button
                    onClick={() => setDialogDay(dayKey)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter une séance
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Creation dialog */}
      <CreateSessionDialog
        open={!!dialogDay}
        dayKey={dialogDay}
        onClose={() => setDialogDay(null)}
        onCreated={handleSessionCreated}
      />
    </>
  )
}
