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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  createTrainingBlock,
  deleteTrainingBlock,
  createTrainingGoal,
  deleteTrainingGoal,
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

export type TrainingBlock = {
  id: string
  name: string
  start_date: string
  end_date: string
}

export type TrainingGoal = {
  id: string
  type: "race" | "weekly_volume" | "weekly_workouts"
  name: string
  target_date: string | null
  target_value: number | null
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

function CreateBlockDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name || !startDate || !endDate) {
      setError("Veuillez remplir tous les champs")
      return
    }

    startTransition(async () => {
      const res = await createTrainingBlock({ name, start_date: startDate, end_date: endDate })
      if (res.error) {
        setError(res.error)
      } else {
        setName("")
        setStartDate("")
        setEndDate("")
        onClose()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un bloc d&apos;entraînement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="block-name">Nom du bloc</Label>
            <Input
              id="block-name"
              placeholder="Foncier, Spécifique, Affûtage..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="block-start">Date de début</Label>
              <Input
                id="block-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-end">Date de fin</Label>
              <Input
                id="block-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Création..." : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CreateGoalDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [type, setType] = useState<"race" | "weekly_volume" | "weekly_workouts">("race")
  const [name, setName] = useState("")
  const [targetDate, setTargetDate] = useState("")
  const [targetValue, setTargetValue] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name) {
      setError("Veuillez donner un nom à l'objectif")
      return
    }
    if (type === "race" && !targetDate) {
      setError("Veuillez sélectionner une date de course")
      return
    }
    if (type !== "race" && !targetValue) {
      setError("Veuillez spécifier une valeur cible")
      return
    }

    startTransition(async () => {
      const val = targetValue ? parseFloat(targetValue) : null
      const date = type === "race" ? targetDate : null
      const res = await createTrainingGoal({
        type,
        name,
        target_date: date,
        target_value: val,
      })
      if (res.error) {
        setError(res.error)
      } else {
        setName("")
        setTargetDate("")
        setTargetValue("")
        onClose()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un objectif</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type d&apos;objectif</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType("race")}
                className={cn(
                  "flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  type === "race"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50"
                )}
              >
                🏁 Course
              </button>
              <button
                type="button"
                onClick={() => setType("weekly_volume")}
                className={cn(
                  "flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  type === "weekly_volume"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50"
                )}
              >
                📈 Volume (km)
              </button>
              <button
                type="button"
                onClick={() => setType("weekly_workouts")}
                className={cn(
                  "flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  type === "weekly_workouts"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50"
                )}
              >
                💪 Séances (nb)
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">Nom / Description</Label>
            <Input
              id="goal-name"
              placeholder={
                type === "race"
                  ? "Marathon de Paris, Trail du Ventoux..."
                  : type === "weekly_volume"
                    ? "Volume hebdomadaire de base, Objectif foncier..."
                    : "Nombre de séances hebdomadaires..."
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {type === "race" ? (
            <div className="space-y-1.5">
              <Label htmlFor="goal-date">Date de la course</Label>
              <Input
                id="goal-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="goal-value">
                {type === "weekly_volume" ? "Distance cible (km)" : "Nombre de séances cible"}
              </Label>
              <Input
                id="goal-value"
                type="number"
                min="1"
                step="any"
                placeholder={type === "weekly_volume" ? "50" : "4"}
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
              />
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Ajout..." : "Ajouter"}
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
  blocks: initialBlocks,
  goals: initialGoals,
}: {
  weekStart: string
  sessions: PlannedSession[]
  activities: (ActivitySummary & { distance_m?: number | null })[]
  blocks: TrainingBlock[]
  goals: TrainingGoal[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogDay, setDialogDay] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [blockDialogOpen, setBlockDialogOpen] = useState(false)
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)

  // Calculations for blocks and goals
  const startOfSelectedWeek = parseISO(weekStart)
  const endOfSelectedWeek = addDays(startOfSelectedWeek, 6)

  const activeBlocks = initialBlocks.filter((b) => {
    const blockStart = parseISO(b.start_date)
    const blockEnd = parseISO(b.end_date)
    return blockStart <= endOfSelectedWeek && blockEnd >= startOfSelectedWeek
  })

  const weeklyGoals = initialGoals.filter((g) => g.type === "weekly_volume" || g.type === "weekly_workouts")
  const raceGoals = initialGoals.filter((g) => g.type === "race")

  const currentWeekKm = activities.reduce((sum, a) => sum + (a.distance_m ?? 0), 0) / 1000
  const currentWeekWorkouts = activities.length

  const getBlockProgress = (b: TrainingBlock) => {
    const blockStart = parseISO(b.start_date)
    const blockEnd = parseISO(b.end_date)
    const totalDays = Math.max(1, Math.round((blockEnd.getTime() - blockStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)
    const elapsedDays = Math.round((todayDate.getTime() - blockStart.getTime()) / (1000 * 60 * 60 * 24))
    const pct = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100))
    return {
      pct,
      elapsed: Math.min(totalDays, Math.max(0, elapsedDays)),
      total: totalDays,
    }
  }

  const getDaysLeft = (targetDateStr: string | null) => {
    if (!targetDateStr) return null
    const target = parseISO(targetDateStr)
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)
    const diffTime = target.getTime() - todayDate.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  function handleDeleteBlock(id: string) {
    startTransition(async () => {
      await deleteTrainingBlock(id)
    })
  }

  function handleDeleteGoal(id: string) {
    startTransition(async () => {
      await deleteTrainingGoal(id)
    })
  }

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Main Calendar Column */}
        <div className="lg:col-span-3 space-y-4">
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
                const dayBlock = initialBlocks.find(
                  (b) => b.start_date <= dayKey && b.end_date >= dayKey
                )

                return (
                  <div key={dayKey} className="flex flex-col gap-1">
                    {dayBlock && (
                      <div
                        className="h-1 w-full bg-indigo-500 dark:bg-indigo-400 rounded-full shrink-0"
                        title={`Bloc : ${dayBlock.name}`}
                      />
                    )}
                    {/* Day header */}
                    <div
                      className={cn(
                        "rounded-md px-1.5 py-1 text-center text-xs font-medium",
                        isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                        dayBlock && !isToday && "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
                      )}
                      title={dayBlock ? `Bloc : ${dayBlock.name}` : undefined}
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
                      className="flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors cursor-pointer"
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
              const dayBlock = initialBlocks.find(
                (b) => b.start_date <= dayKey && b.end_date >= dayKey
              )

              return (
                <div
                  key={dayKey}
                  className={cn(
                    "rounded-lg border bg-card transition-colors",
                    isToday && "border-primary/50",
                    dayBlock && !isToday && "border-indigo-200 dark:border-indigo-950/60",
                  )}
                >
                  {/* Accordion header */}
                  <button
                    className="flex w-full items-center justify-between px-4 py-3 cursor-pointer"
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
                      {dayBlock && (
                        <span
                          className="h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400 shrink-0"
                          title={`Bloc : ${dayBlock.name}`}
                        />
                      )}
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
                        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors cursor-pointer"
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
        </div>

        {/* Sidebar Column: Blocks and Goals */}
        <div className="space-y-4">
          {/* Bloc d'entraînement Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">🧱 Bloc d&apos;entraînement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              {activeBlocks.length > 0 ? (
                activeBlocks.map((b) => {
                  const progress = getBlockProgress(b)
                  return (
                    <div key={b.id} className="space-y-2 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm">{b.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Du {format(parseISO(b.start_date), "d MMM", { locale: fr })} au{" "}
                            {format(parseISO(b.end_date), "d MMM yyyy", { locale: fr })}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteBlock(b.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                          title="Supprimer le bloc"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="h-2 overflow-hidden rounded-full bg-muted w-full">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${progress.pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>Jour {progress.elapsed} / {progress.total}</span>
                          <span>{Math.round(progress.pct)}%</span>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-4 border border-dashed border-border rounded-lg space-y-2">
                  <p className="text-xs text-muted-foreground">Aucun bloc actif cette semaine</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBlockDialogOpen(true)}
                    className="text-xs h-7 px-2.5 cursor-pointer"
                  >
                    + Définir un bloc
                  </Button>
                </div>
              )}
              {activeBlocks.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-7 mt-1 cursor-pointer"
                  onClick={() => setBlockDialogOpen(true)}
                >
                  + Nouveau bloc
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Objectifs de la semaine Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">🎯 Objectifs de la semaine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              {weeklyGoals.length > 0 ? (
                <div className="space-y-3">
                  {weeklyGoals.map((g) => {
                    const isVolume = g.type === "weekly_volume"
                    const current = isVolume ? currentWeekKm : currentWeekWorkouts
                    const target = g.target_value ?? 1
                    const pct = Math.min(100, (current / target) * 100)
                    
                    return (
                      <div key={g.id} className="space-y-1.5 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-xs">{g.name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">
                              {isVolume ? "Volume en kilomètres" : "Nombre de séances"}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteGoal(g.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0 cursor-pointer"
                            title="Supprimer l'objectif"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="h-2 overflow-hidden rounded-full bg-muted w-full">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                            <span>
                              {isVolume
                                ? `${current.toFixed(1)} / ${target.toFixed(0)} km`
                                : `${current} / ${target} séance${target > 1 ? "s" : ""}`}
                            </span>
                            <span>{Math.round(pct)}%</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-4 border border-dashed border-border rounded-lg space-y-2">
                  <p className="text-xs text-muted-foreground">Aucun objectif hebdomadaire</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGoalDialogOpen(true)}
                    className="text-xs h-7 px-2.5 cursor-pointer"
                  >
                    + Ajouter un objectif
                  </Button>
                </div>
              )}
              {weeklyGoals.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-7 mt-1 cursor-pointer"
                  onClick={() => setGoalDialogOpen(true)}
                >
                  + Ajouter un objectif
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Courses & Événements Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">🏁 Événements & Courses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              {raceGoals.length > 0 ? (
                <div className="space-y-2.5">
                  {raceGoals.map((g) => {
                    const daysLeft = getDaysLeft(g.target_date)
                    let badgeColor = "bg-primary text-primary-foreground"
                    let badgeText = ""
                    if (daysLeft !== null) {
                      if (daysLeft > 0) {
                        badgeText = `J-${daysLeft}`
                        badgeColor = daysLeft <= 7 ? "bg-red-500 text-white" : daysLeft <= 30 ? "bg-amber-500 text-white" : "bg-blue-500 text-white"
                      } else if (daysLeft === 0) {
                        badgeText = "Aujourd'hui"
                        badgeColor = "bg-emerald-500 text-white animate-pulse"
                      } else {
                        badgeText = "Terminé"
                        badgeColor = "bg-muted text-muted-foreground"
                      }
                    }
                    
                    return (
                      <div key={g.id} className="flex items-center justify-between gap-3 border-b border-border/40 pb-2.5 last:border-0 last:pb-0">
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <p className="font-semibold text-xs truncate">{g.name}</p>
                          {g.target_date && (
                            <p className="text-[10px] text-muted-foreground">
                              {format(parseISO(g.target_date), "d MMMM yyyy", { locale: fr })}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide shadow-xs", badgeColor)}>
                            {badgeText}
                          </span>
                          <button
                            onClick={() => handleDeleteGoal(g.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                            title="Supprimer la course"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-4 border border-dashed border-border rounded-lg space-y-2">
                  <p className="text-xs text-muted-foreground">Aucun événement planifié</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGoalDialogOpen(true)}
                    className="text-xs h-7 px-2.5 cursor-pointer"
                  >
                    + Planifier une course
                  </Button>
                </div>
              )}
              {raceGoals.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-7 mt-1 cursor-pointer"
                  onClick={() => setGoalDialogOpen(true)}
                >
                  + Planifier une course
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Creation dialog */}
      <CreateSessionDialog
        open={!!dialogDay}
        dayKey={dialogDay}
        onClose={() => setDialogDay(null)}
        onCreated={handleSessionCreated}
      />

      <CreateBlockDialog
        open={blockDialogOpen}
        onClose={() => setBlockDialogOpen(false)}
      />

      <CreateGoalDialog
        open={goalDialogOpen}
        onClose={() => setGoalDialogOpen(false)}
      />
    </>
  )
}
