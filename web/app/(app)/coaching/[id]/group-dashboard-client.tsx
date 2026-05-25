"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  calculateGroupReadiness,
  estimateRaceTime,
  getBenchmarks,
} from "@/lib/compute/performance"
import {
  Calendar,
  Clock,
  HeartPulse,
  Info,
  Key,
  LineChart,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  Shield,
  Trash2,
  Trophy,
  User,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import {
  createGroupPlannedSession,
  createGroupTrainingBlock,
  deleteGroupPlannedSession,
  deleteGroupTrainingBlock,
  leaveGroup,
  promoteMemberToCoach,
  updateGroupMemberTargetTime,
} from "../actions"

type Group = {
  id: string
  name: string
  description: string | null
  target_event_name: string
  target_event_date: string
  target_distance_km: number
  invite_code: string
}

type Member = {
  group_id: string
  user_id: string
  role: "admin" | "coach" | "athlete"
  target_time_sec: number | null
  profiles: {
    display_name: string | null
    avatar_url: string | null
    email: string
  } | null
}

interface GroupDashboardClientProps {
  group: Group
  members: Member[]
  activities: any[]
  groupSessions: any[]
  groupBlocks: any[]
  currentUserId: string
  currentUserRole: "admin" | "coach" | "athlete"
}

function formatSecondsToTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "--:--:--"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`
  return `${m}m ${s.toString().padStart(2, "0")}s`
}

function timeToSeconds(hours: number, minutes: number, seconds: number): number {
  return hours * 3600 + minutes * 60 + seconds
}

export function GroupDashboardClient({
  group,
  members,
  activities,
  groupSessions,
  groupBlocks,
  currentUserId,
  currentUserRole,
}: GroupDashboardClientProps) {
  const router = useRouter()
  const supabase = createClient()
  const isCoachOrAdmin = currentUserRole === "admin" || currentUserRole === "coach"

  const [activeTab, setActiveTab] = useState("dashboard")
  const [loading, setLoading] = useState(false)

  // Modals state
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [showBlockModal, setShowBlockModal] = useState(false)

  // Target time state
  const currentMember = members.find((m) => m.user_id === currentUserId)
  const initialTarget = currentMember?.target_time_sec ?? 0
  const [targetHours, setTargetHours] = useState(Math.floor(initialTarget / 3600).toString())
  const [targetMinutes, setTargetMinutes] = useState(Math.floor((initialTarget % 3600) / 60).toString())
  const [targetSeconds, setTargetSeconds] = useState((initialTarget % 60).toString())

  // New session state
  const [sessionDate, setSessionDate] = useState("")
  const [sessionTime, setSessionTime] = useState("")
  const [sessionSport, setSessionSport] = useState("Run")
  const [sessionType, setSessionType] = useState("Seuil")
  const [sessionDuration, setSessionDuration] = useState("")
  const [sessionDistance, setSessionDistance] = useState("")
  const [sessionDesc, setSessionDesc] = useState("")

  // New block state
  const [blockName, setBlockName] = useState("")
  const [blockStart, setBlockStart] = useState("")
  const [blockEnd, setBlockEnd] = useState("")

  // Coach tracking state
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("")
  const [athleteMetrics, setAthleteMetrics] = useState<any[]>([])
  const [athleteInjuries, setAthleteInjuries] = useState<any[]>([])
  const [loadingAthleteData, setLoadingAthleteData] = useState(false)

  // Calcule les estimations et scores pour chaque membre
  const membersLeaderboard = members
    .map((member) => {
      const memberActs = activities.filter((act) => act.user_id === member.user_id)
      const readiness = calculateGroupReadiness(memberActs, group.target_distance_km)
      const estimation = estimateRaceTime(memberActs, group.target_distance_km)

      // Calcul des volumes
      const runs = memberActs.filter((a) => {
        const norm = a.sport_type.toLowerCase()
        return norm.includes("run") || norm.includes("trail")
      })
      const totalDist = runs.reduce((sum, a) => sum + (a.distance_m ?? 0), 0)
      const weeklyVolume = totalDist / 4000 // moyenne hebdo sur 4 semaines en km
      const longestRun = runs.reduce((max, a) => Math.max(max, (a.distance_m ?? 0) / 1000), 0)

      return {
        ...member,
        readiness,
        estimation,
        weeklyVolume,
        longestRun,
      }
    })
    .sort((a, b) => b.readiness - a.readiness) // par défaut trié par Readiness

  const estimationLeaderboard = [...membersLeaderboard]
    .filter((m) => m.estimation !== null)
    .sort((a, b) => (a.estimation ?? 0) - (b.estimation ?? 0))

  const handleUpdateTargetTime = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const secs = timeToSeconds(
      parseInt(targetHours) || 0,
      parseInt(targetMinutes) || 0,
      parseInt(targetSeconds) || 0
    )
    const res = await updateGroupMemberTargetTime(group.id, secs || null)
    setLoading(false)

    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success("Objectif de temps mis à jour !")
      setShowTargetModal(false)
      router.refresh()
    }
  }

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionDate || !sessionSport || !sessionType) {
      toast.error("Veuillez remplir tous les champs requis")
      return
    }

    setLoading(true)
    const res = await createGroupPlannedSession(group.id, {
      planned_date: sessionDate,
      planned_time: sessionTime || undefined,
      sport_type: sessionSport,
      session_type: sessionType,
      planned_duration_min: parseInt(sessionDuration) || null,
      planned_distance_km: parseFloat(sessionDistance) || null,
      description: sessionDesc || null,
    })
    setLoading(false)

    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success("Séance collective planifiée avec succès !")
      setShowSessionModal(false)
      // Reset
      setSessionDate("")
      setSessionTime("")
      setSessionDuration("")
      setSessionDistance("")
      setSessionDesc("")
      router.refresh()
    }
  }

  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!blockName || !blockStart || !blockEnd) {
      toast.error("Veuillez remplir tous les champs")
      return
    }

    setLoading(true)
    const res = await createGroupTrainingBlock(group.id, {
      name: blockName,
      start_date: blockStart,
      end_date: blockEnd,
    })
    setLoading(false)

    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success("Bloc d'entraînement créé avec succès !")
      setShowBlockModal(false)
      setBlockName("")
      setBlockStart("")
      setBlockEnd("")
      router.refresh()
    }
  }

  const handleDeleteSession = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette séance pour tout le groupe ? Les séances individuelles non réalisées seront supprimées.")) return

    setLoading(true)
    const res = await deleteGroupPlannedSession(group.id, id)
    setLoading(false)

    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success("Séance collective supprimée")
      router.refresh()
    }
  }

  const handleDeleteBlock = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce bloc pour tout le groupe ?")) return

    setLoading(true)
    const res = await deleteGroupTrainingBlock(group.id, id)
    setLoading(false)

    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success("Bloc collectif supprimé")
      router.refresh()
    }
  }

  const handlePromote = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "coach" ? "athlete" : "coach"
    const confirmMsg =
      newRole === "coach"
        ? "Promouvoir ce membre en tant que Coach de groupe ?"
        : "Retirer le rôle de Coach à ce membre ?"

    if (!confirm(confirmMsg)) return

    setLoading(true)
    const res = await promoteMemberToCoach(group.id, userId, newRole)
    setLoading(false)

    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success("Rôle mis à jour")
      router.refresh()
    }
  }

  const handleLeave = async () => {
    if (!confirm("Voulez-vous vraiment quitter ce groupe ? Vous perdrez l'accès aux classements collectifs.")) return

    setLoading(true)
    const res = await leaveGroup(group.id)
    setLoading(false)

    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success("Vous avez quitté le groupe")
      router.push("/coaching")
    }
  }

  // Charge les métriques et blessures de l'athlète sélectionné (Vue Coach)
  useEffect(() => {
    if (!selectedAthleteId || !isCoachOrAdmin) return

    const loadAthleteData = async () => {
      setLoadingAthleteData(true)
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 14) // 2 dernières semaines de métriques

      const [metricsRes, injuriesRes] = await Promise.all([
        supabase
          .from("daily_metrics")
          .select("*")
          .eq("user_id", selectedAthleteId)
          .gte("metric_date", cutoff.toISOString().slice(0, 10))
          .order("metric_date", { ascending: false }),
        supabase
          .from("injuries")
          .select("*")
          .eq("user_id", selectedAthleteId)
          .order("created_at", { ascending: false }),
      ])

      setAthleteMetrics(metricsRes.data || [])
      setAthleteInjuries(injuriesRes.data || [])
      setLoadingAthleteData(false)
    }

    loadAthleteData()
  }, [selectedAthleteId, isCoachOrAdmin])

  const targetDate = new Date(group.target_event_date)
  const daysLeft = Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Group Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-6 shadow-lg border border-indigo-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4">
          <Badge className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-1 px-3 text-sm">
            {daysLeft > 0 ? `J-${daysLeft}` : daysLeft === 0 ? "Jour de Course ! 🎉" : "Objectif Terminé"}
          </Badge>
        </div>
        <div className="relative z-10 space-y-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-indigo-100">{group.name}</h1>
            <p className="text-indigo-200/80 max-w-2xl text-sm">{group.description || "Pas de description."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm text-indigo-200/90 pt-2">
            <div className="flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-400" />
              <span className="font-semibold">{group.target_event_name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>{targetDate.toLocaleDateString("fr-FR", { dateStyle: "long" })}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              <span>Cible : {group.target_distance_km} km</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              <span>{members.length} participant{members.length > 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
        <div className="absolute right-4 bottom-4 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-red-400 hover:text-red-300 hover:bg-red-950/20 gap-1.5">
            <LogOut className="h-4 w-4" /> Quitter le groupe
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted p-1">
          <TabsTrigger value="dashboard" className="gap-2"><Trophy className="h-4 w-4" /> Préparation & Course</TabsTrigger>
          <TabsTrigger value="planning" className="gap-2"><Calendar className="h-4 w-4" /> Planning Collectif</TabsTrigger>
          <TabsTrigger value="members" className="gap-2"><Users className="h-4 w-4" /> Membres</TabsTrigger>
          {isCoachOrAdmin && (
            <TabsTrigger value="coaching" className="gap-2 text-indigo-600 dark:text-indigo-400 font-semibold"><Shield className="h-4 w-4" /> Suivi Athlètes</TabsTrigger>
          )}
        </TabsList>

        {/* Tab 1: Dashboard */}
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Readiness Leaderboard */}
            <Card className="border-muted/60">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <LineChart className="h-5 w-5 text-indigo-500" />
                  Indice de Préparation
                </CardTitle>
                <CardDescription>
                  État de forme globale basé sur le volume et les sorties longues des 28 derniers jours.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {membersLeaderboard.map((member, index) => {
                  const isCurrentUser = member.user_id === currentUserId
                  return (
                    <div key={member.user_id} className={`flex items-center justify-between p-3 rounded-lg border ${isCurrentUser ? "bg-primary/5 border-primary/30" : "bg-card border-muted/50"}`}>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-muted-foreground w-4">{index + 1}</span>
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {member.profiles?.display_name?.substring(0, 2).toUpperCase() || "SP"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-semibold truncate max-w-[120px]">
                            {member.profiles?.display_name || member.profiles?.email.split("@")[0]}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.role === "admin" ? "Admin" : member.role === "coach" ? "Coach" : "Athlète"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">Vol. / Sortie</p>
                          <p className="text-xs font-medium">
                            {Math.round(member.weeklyVolume)} km/sem · {Math.round(member.longestRun)} km
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Préparation</p>
                          <Badge variant={member.readiness >= 75 ? "default" : member.readiness >= 40 ? "secondary" : "destructive"} className="text-xs font-semibold">
                            {member.readiness}%
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Event Time Simulations */}
            <Card className="border-muted/60">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Simulations du Jour de Course
                </CardTitle>
                <CardDescription>
                  Temps estimé basé sur le rythme réel des entraînements et pénalisé selon l'indice de préparation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {estimationLeaderboard.length === 0 ? (
                  <div className="text-center py-12 space-y-2 text-muted-foreground">
                    <Info className="h-8 w-8 mx-auto opacity-40" />
                    <p className="text-sm font-medium">Pas assez de données d'entraînement</p>
                    <p className="text-xs max-w-xs mx-auto">
                      Les membres doivent enregistrer au moins une activité de course à pied dans les 28 derniers jours pour être listés.
                    </p>
                  </div>
                ) : (
                  estimationLeaderboard.map((member, index) => {
                    const isCurrentUser = member.user_id === currentUserId
                    const target = member.target_time_sec
                    const est = member.estimation

                    let differenceText = ""
                    let diffColor = "text-muted-foreground"

                    if (target && est) {
                      const diff = est - target
                      if (diff > 0) {
                        differenceText = `+${formatSecondsToTime(diff)}`
                        diffColor = "text-red-500 font-medium"
                      } else {
                        differenceText = `-${formatSecondsToTime(Math.abs(diff))}`
                        diffColor = "text-green-600 font-medium dark:text-green-400"
                      }
                    }

                    return (
                      <div key={member.user_id} className={`flex items-center justify-between p-3 rounded-lg border ${isCurrentUser ? "bg-primary/5 border-primary/30" : "bg-card border-muted/50"}`}>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-muted-foreground w-4">{index + 1}</span>
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {member.profiles?.display_name?.substring(0, 2).toUpperCase() || "SP"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold truncate max-w-[120px]">
                              {member.profiles?.display_name || member.profiles?.email.split("@")[0]}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Cible : {target ? formatSecondsToTime(target) : "non définie"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Chrono Estimé</p>
                          <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                            {formatSecondsToTime(est)}
                          </p>
                          {target && (
                            <p className={`text-[10px] ${diffColor}`}>
                              {differenceText} (vs obj)
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Planning Collectif */}
        <TabsContent value="planning" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Calendrier et Blocs Collectifs</h2>
              <p className="text-sm text-muted-foreground">Séances et périodes d'entraînement programmées par les coachs pour l'ensemble du groupe.</p>
            </div>
            {isCoachOrAdmin && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowBlockModal(true)} className="gap-1">
                  <Plus className="h-4 w-4" /> Bloc
                </Button>
                <Button size="sm" onClick={() => setShowSessionModal(true)} className="gap-1 bg-primary text-white">
                  <Plus className="h-4 w-4" /> Séance
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Blocs de Préparation */}
            <div className="md:col-span-1 space-y-4">
              <h3 className="text-md font-semibold flex items-center gap-2">
                <Info className="h-4 w-4 text-indigo-500" />
                Blocs collectifs
              </h3>
              {groupBlocks.length === 0 ? (
                <Card className="p-6 text-center border-dashed text-muted-foreground text-sm">
                  Aucun bloc d'entraînement planifié pour le groupe.
                </Card>
              ) : (
                groupBlocks.map((block) => (
                  <Card key={block.id} className="relative">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-bold">{block.name}</CardTitle>
                      <CardDescription className="text-xs">
                        Du {new Date(block.start_date).toLocaleDateString("fr-FR")} au {new Date(block.end_date).toLocaleDateString("fr-FR")}
                      </CardDescription>
                    </CardHeader>
                    {isCoachOrAdmin && (
                      <div className="absolute top-2 right-2">
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteBlock(block.id)} className="h-7 w-7 text-muted-foreground hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </Card>
                ))
              )}
            </div>

            {/* Séances Collectives */}
            <div className="md:col-span-2 space-y-4">
              <h3 className="text-md font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-500" />
                Séances collectives planifiées
              </h3>
              {groupSessions.length === 0 ? (
                <Card className="p-12 text-center border-dashed text-muted-foreground text-sm">
                  Aucune séance collective planifiée. Les coachs peuvent en poser à tout moment.
                </Card>
              ) : (
                <div className="space-y-3">
                  {groupSessions.map((session) => (
                    <Card key={session.id} className="hover:bg-muted/10 transition-colors relative">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="space-y-1 pr-8">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-primary/5 text-primary text-xs border-primary/20">
                              {session.sport_type}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {session.session_type}
                            </Badge>
                          </div>
                          <p className="text-sm font-semibold pt-1">
                            {new Date(session.planned_date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}
                            {session.planned_time ? ` à ${session.planned_time.substring(0, 5)}` : ""}
                          </p>
                          {session.description && (
                            <p className="text-xs text-muted-foreground italic line-clamp-2 pt-0.5">{session.description}</p>
                          )}
                        </div>
                        <div className="text-right flex items-center gap-4 shrink-0">
                          <div>
                            {session.planned_distance_km && (
                              <p className="text-sm font-semibold">{session.planned_distance_km} km</p>
                            )}
                            {session.planned_duration_min && (
                              <p className="text-xs text-muted-foreground">{session.planned_duration_min} min</p>
                            )}
                          </div>
                          {isCoachOrAdmin && (
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteSession(session.id)} className="text-muted-foreground hover:text-red-500 h-8 w-8">
                              <Trash2 className="h-4.5 w-4.5" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Members */}
        <TabsContent value="members" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Target Personal Time Form */}
            <Card className="md:col-span-1 border-muted/60">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-500" />
                  Mon Objectif de Temps
                </CardTitle>
                <CardDescription>
                  Définissez le chrono que vous visez le jour de la course pour voir les écarts de simulation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateTargetTime} className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="hours" className="text-xs">Heures</Label>
                      <Input id="hours" type="number" placeholder="3" value={targetHours} onChange={(e) => setTargetHours(e.target.value)} min={0} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="minutes" className="text-xs">Minutes</Label>
                      <Input id="minutes" type="number" placeholder="30" value={targetMinutes} onChange={(e) => setTargetMinutes(e.target.value)} min={0} max={59} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="seconds" className="text-xs">Secondes</Label>
                      <Input id="seconds" type="number" placeholder="0" value={targetSeconds} onChange={(e) => setTargetSeconds(e.target.value)} min={0} max={59} />
                    </div>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full bg-primary text-white">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Enregistrer l'objectif
                  </Button>
                </form>
              </CardContent>
              <Separator />
              <CardFooter className="py-4 flex flex-col items-start gap-2 bg-muted/5">
                <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                  <Key className="h-3.5 w-3.5" /> Code d'invitation du groupe
                </span>
                <div className="flex w-full items-center gap-2">
                  <Input readOnly value={group.invite_code} className="font-mono text-center select-all bg-muted border-dashed" />
                </div>
                <p className="text-[10px] text-muted-foreground">Partagez ce code à 6 lettres avec vos amis pour qu'ils rejoignent la préparation.</p>
              </CardFooter>
            </Card>

            {/* Members List with Admin controls */}
            <Card className="md:col-span-2 border-muted/60">
              <CardHeader>
                <CardTitle className="text-lg">Liste des Participants ({members.length})</CardTitle>
                <CardDescription>Membres actifs du groupe et leurs rôles d'encadrement.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {members.map((member) => {
                  const isSelf = member.user_id === currentUserId
                  const isAdminOfGroup = currentUserRole === "admin"
                  const canManage = isAdminOfGroup && !isSelf

                  return (
                    <div key={member.user_id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/5 transition-colors">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                            {member.profiles?.display_name?.substring(0, 2).toUpperCase() || "SP"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold">
                            {member.profiles?.display_name || member.profiles?.email.split("@")[0]} {isSelf && "(Vous)"}
                          </p>
                          <p className="text-xs text-muted-foreground">{member.profiles?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={member.role === "admin" ? "default" : member.role === "coach" ? "secondary" : "outline"} className={member.role === "coach" ? "bg-indigo-500/10 text-indigo-600 border-indigo-200 dark:border-indigo-800" : ""}>
                          {member.role === "admin" ? "Administrateur" : member.role === "coach" ? "Coach" : "Athlète"}
                        </Badge>
                        {canManage && (
                          <Button size="sm" variant="ghost" onClick={() => handlePromote(member.user_id, member.role)} className="text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                            {member.role === "coach" ? "Retirer Coach" : "Nommer Coach"}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Coaching (Coaches & Admins Only) */}
        {isCoachOrAdmin && (
          <TabsContent value="coaching" className="space-y-6">
            <Card className="border-indigo-500/20">
              <CardHeader>
                <CardTitle className="text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Espace d'Analyse Coach
                </CardTitle>
                <CardDescription>
                  Sélectionnez un athlète pour analyser ses dernières métriques, sa fatigue et ses alertes de blessure.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="max-w-xs space-y-1">
                  <Label htmlFor="athlete-select">Sélectionner un athlète</Label>
                  <Select value={selectedAthleteId} onValueChange={(val) => setSelectedAthleteId(val || "")}>
                    <SelectTrigger id="athlete-select">
                      <SelectValue placeholder="Choisir un athlète du groupe" />
                    </SelectTrigger>
                    <SelectContent>
                      {members
                        .filter((m) => m.user_id !== currentUserId || currentUserRole === "admin") // ne pas se lister soi-même sauf si admin
                        .map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {member.profiles?.display_name || member.profiles?.email.split("@")[0]}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedAthleteId ? (
                  loadingAthleteData ? (
                    <div className="flex justify-center items-center py-16 text-muted-foreground gap-2">
                      <Loader2 className="h-6 w-6 animate-spin" /> Chargement des données athlète...
                    </div>
                  ) : (
                    <div className="grid gap-6 md:grid-cols-2 pt-2">
                      {/* Health Metrics Card */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-md font-bold flex items-center gap-1.5">
                            <Clock className="h-4.5 w-4.5 text-primary" />
                            Métriques de récupération (14j)
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {athleteMetrics.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-6 text-center">
                              Aucune métrique Garmin enregistrée sur les 14 derniers jours.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {athleteMetrics.map((m) => (
                                <div key={m.metric_date} className="flex justify-between items-center text-sm border-b pb-1.5 last:border-0">
                                  <span className="font-medium">
                                    {new Date(m.metric_date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                                  </span>
                                  <div className="flex gap-4">
                                    <span>Readiness: <span className="font-bold text-green-600 dark:text-green-400">{m.training_readiness ?? "–"}/100</span></span>
                                    <span>Charge: <span className="font-semibold">{Math.round(m.training_load ?? 0)} pts</span></span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Injuries and Alerts Card */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-md font-bold flex items-center gap-1.5 text-red-500">
                            <HeartPulse className="h-4.5 w-4.5" />
                            Registre des blessures déclaré
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {athleteInjuries.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-6 text-center">
                              Aucune blessure déclarée par cet athlète. 👍
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {athleteInjuries.map((inj) => (
                                <div key={inj.id} className="p-3 rounded-lg border border-red-200 dark:border-red-950/60 bg-red-50/20 dark:bg-red-950/10 space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-bold text-red-600 dark:text-red-400 uppercase">{inj.body_part}</span>
                                    <span className="text-muted-foreground">{new Date(inj.start_date).toLocaleDateString("fr-FR")}</span>
                                  </div>
                                  <p className="text-sm font-semibold">{inj.injury_type}</p>
                                  {inj.notes && <p className="text-xs text-muted-foreground">{inj.notes}</p>}
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  )
                ) : (
                  <div className="text-center py-16 text-muted-foreground text-sm border border-dashed rounded-lg">
                    Sélectionnez un athlète ci-dessus pour afficher ses données d'entraînement.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Modal Planning de Séance Collective */}
      <Dialog open={showSessionModal} onOpenChange={setShowSessionModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Planifier une séance de groupe</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSession} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-date">Date de la séance *</Label>
                <Input id="s-date" type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-time">Heure (facultative)</Label>
                <Input id="s-time" type="time" value={sessionTime} onChange={(e) => setSessionTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-sport">Sport *</Label>
                <Select value={sessionSport} onValueChange={(val) => setSessionSport(val || "Run")}>
                  <SelectTrigger id="s-sport">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Run">Course à pied</SelectItem>
                    <SelectItem value="Ride">Vélo</SelectItem>
                    <SelectItem value="Swim">Natation</SelectItem>
                    <SelectItem value="Workout">Musculation/Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-type">Type de séance *</Label>
                <Select value={sessionType} onValueChange={(val) => setSessionType(val || "Seuil")}>
                  <SelectTrigger id="s-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Seuil">Seuil</SelectItem>
                    <SelectItem value="Endurance">Endurance Fondamentale</SelectItem>
                    <SelectItem value="VMA">Fractionné VMA</SelectItem>
                    <SelectItem value="Sortie Longue">Sortie Longue</SelectItem>
                    <SelectItem value="Récupération">Récupération</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-duration">Durée planifiée (minutes)</Label>
                <Input id="s-duration" type="number" placeholder="60" value={sessionDuration} onChange={(e) => setSessionDuration(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-distance">Distance planifiée (km)</Label>
                <Input id="s-distance" type="number" step="0.1" placeholder="10" value={sessionDistance} onChange={(e) => setSessionDistance(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-desc">Consignes de la séance</Label>
              <textarea
                id="s-desc"
                placeholder="Ex: 5x1000m allure seuil avec 1'30 de récupération"
                value={sessionDesc}
                onChange={(e) => setSessionDesc(e.target.value)}
                className="w-full min-h-[80px] text-sm p-2 rounded-md border bg-card"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowSessionModal(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={loading} className="bg-primary text-white">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Planifier la séance
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Créer un Bloc Collectif */}
      <Dialog open={showBlockModal} onOpenChange={setShowBlockModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Créer un bloc d'entraînement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateBlock} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="b-name">Nom du bloc *</Label>
              <Input id="b-name" placeholder="Ex: Développement VMA - Cycle 1" value={blockName} onChange={(e) => setBlockName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="b-start">Date de début *</Label>
                <Input id="b-start" type="date" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-end">Date de fin *</Label>
                <Input id="b-end" type="date" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} required />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowBlockModal(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={loading} className="bg-primary text-white">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Créer le bloc
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
