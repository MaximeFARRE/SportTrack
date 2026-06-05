"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"
import {
  ArrowRight,
  Calendar,
  Key,
  Loader2,
  MapPin,
  Plus,
  Trophy,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { createGroup, joinGroup } from "./actions"

type Group = {
  id: string
  name: string
  description: string | null
  target_event_name: string
  target_event_date: string
  target_distance_km: number
  invite_code: string
}

interface CoachingClientProps {
  initialGroups: Group[]
}

export function CoachingClient({ initialGroups }: CoachingClientProps) {
  const router = useRouter()
  const [groups, setGroups] = useState<Group[]>(initialGroups)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [loading, setLoading] = useState(false)

  // Form join state
  const [inviteCode, setInviteCode] = useState("")

  // Form create state
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupDesc, setNewGroupDesc] = useState("")
  const [newGroupEvent, setNewGroupEvent] = useState("")
  const [newGroupDate, setNewGroupDate] = useState("")
  const [newGroupDistance, setNewGroupDistance] = useState("42.195")

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteCode.trim()) return

    setLoading(true)
    const res = await joinGroup(inviteCode)
    setLoading(false)

    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success("Groupe rejoint avec succès !")
      setShowJoinModal(false)
      setInviteCode("")
      router.push(`/coaching/${res.groupId}`)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupName.trim() || !newGroupEvent.trim() || !newGroupDate.trim()) {
      toast.error("Veuillez remplir tous les champs obligatoires")
      return
    }

    setLoading(true)
    const res = await createGroup({
      name: newGroupName,
      description: newGroupDesc,
      targetEventName: newGroupEvent,
      targetEventDate: newGroupDate,
      targetDistanceKm: parseFloat(newGroupDistance) || 10,
    })
    setLoading(false)

    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success("Groupe créé avec succès !")
      setShowCreateModal(false)
      // Reset form
      setNewGroupName("")
      setNewGroupDesc("")
      setNewGroupEvent("")
      setNewGroupDate("")
      setNewGroupDistance("42.195")
      router.push(`/coaching/${res.groupId}`)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-violet-600 bg-clip-text text-transparent">
            Coaching & Groupes
          </h1>
          <p className="text-muted-foreground mt-1">
            Entraînez-vous à plusieurs, comparez votre préparation et planifiez ensemble vos objectifs de course.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowJoinModal(true)} className="gap-2">
            <Key className="h-4 w-4" /> Rejoindre
          </Button>
          <Button onClick={() => setShowCreateModal(true)} className="gap-2 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/95 hover:to-violet-600/95 text-white">
            <Plus className="h-4 w-4" /> Créer un groupe
          </Button>
        </div>
      </div>

      {/* Main Content */}
      {groups.length === 0 ? (
        <Card className="border-dashed border-2 py-16 text-center flex flex-col items-center justify-center gap-4 bg-muted/20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="h-8 w-8" />
          </div>
          <div className="max-w-md space-y-1">
            <h2 className="text-xl font-semibold">Aucun groupe pour le moment</h2>
            <p className="text-sm text-muted-foreground">
              Créez un groupe pour fédérer vos amis autour d'un objectif de course (ex: Marathon de Paris) ou rejoignez un groupe existant avec un code d'invitation.
            </p>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowJoinModal(true)} className="gap-2">
              <Key className="h-4 w-4" /> Saisir un code
            </Button>
            <Button onClick={() => setShowCreateModal(true)} className="gap-2 bg-gradient-to-r from-primary to-violet-600 text-white">
              Créer mon premier groupe
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const date = new Date(group.target_event_date)
            const daysLeft = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            const countdownText =
              daysLeft > 0
                ? `J-${daysLeft}`
                : daysLeft === 0
                ? "Aujourd'hui ! 🚀"
                : `Passé (${formatDistanceToNow(date, { addSuffix: true, locale: fr })})`

            return (
              <Card key={group.id} className="flex flex-col overflow-hidden hover:shadow-md transition-shadow border-muted/60">
                <CardHeader className="pb-4 bg-gradient-to-br from-card to-muted/10 relative">
                  <div className="absolute right-4 top-4">
                    <Badge variant={daysLeft >= 0 ? "default" : "secondary"} className={daysLeft >= 0 ? "bg-indigo-500 hover:bg-indigo-600 text-white" : ""}>
                      {countdownText}
                    </Badge>
                  </div>
                  <CardTitle className="pr-12 text-lg line-clamp-1">{group.name}</CardTitle>
                  <CardDescription className="line-clamp-2 mt-1 min-h-[40px]">
                    {group.description || "Aucune description fournie."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 py-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
                    <span className="font-medium text-foreground">{group.target_event_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>{new Date(group.target_event_date).toLocaleDateString("fr-FR", { dateStyle: "long" })}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>Distance : {group.target_distance_km} km</span>
                  </div>
                </CardContent>
                <CardFooter className="border-t pt-4 bg-muted/5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-mono">
                    Code : <span className="font-semibold text-foreground select-all">{group.invite_code}</span>
                  </span>
                  <Link
                    href={`/coaching/${group.id}`}
                    className={buttonVariants({
                      size: "sm",
                      className:
                        "gap-1.5 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/95 hover:to-violet-600/95 text-white",
                    })}
                  >
                    Accéder <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal Rejoindre un groupe */}
      <Dialog open={showJoinModal} onOpenChange={setShowJoinModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rejoindre un groupe d'entraînement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleJoin} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="inviteCode">Code d'invitation</Label>
              <Input
                id="inviteCode"
                placeholder="Ex: PARIS2026"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                maxLength={10}
                required
                className="uppercase"
              />
              <p className="text-xs text-muted-foreground">
                Saisissez le code d'invitation à 6 caractères généré par le créateur du groupe.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowJoinModal(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={loading} className="bg-primary text-white">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Rejoindre le groupe
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Créer un groupe */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Créer un groupe d'entraînement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom du groupe *</Label>
              <Input
                id="name"
                placeholder="Ex: La Meute de l'Endurance"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (facultative)</Label>
              <Input
                id="description"
                placeholder="Ex: Groupe d'amis préparant un objectif commun"
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="event">Nom de la course *</Label>
                <Input
                  id="event"
                  placeholder="Ex: Marathon de Paris"
                  value={newGroupEvent}
                  onChange={(e) => setNewGroupEvent(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date de la course *</Label>
                <Input
                  id="date"
                  type="date"
                  value={newGroupDate}
                  onChange={(e) => setNewGroupDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="distance">Distance cible (en kilomètres) *</Label>
              <Input
                id="distance"
                type="number"
                step="0.001"
                placeholder="42.195"
                value={newGroupDistance}
                onChange={(e) => setNewGroupDistance(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Permet d'ajuster les estimations de préparation et de performance (ex: 5, 10, 21.1, 42.195).
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={loading} className="bg-primary text-white">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Créer le groupe
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
