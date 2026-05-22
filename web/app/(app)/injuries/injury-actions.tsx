"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, MoreHorizontal, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { deleteInjury, updateInjuryEndDate } from "./actions"

interface InjuryActionsProps {
  injury: {
    id: string
    end_date: string | null
  }
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

export function InjuryActions({ injury }: InjuryActionsProps) {
  const [isPending, startTransition] = useTransition()
  const isActive = !injury.end_date

  function handleMarkRecovered() {
    startTransition(async () => {
      const result = await updateInjuryEndDate(injury.id, todayDate())
      if (result.error) toast.error(result.error)
      else toast.success("Blessure marquée comme guérie")
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteInjury(injury.id)
      if (result.error) toast.error(result.error)
      else toast.success("Blessure supprimée")
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isActive && (
          <DropdownMenuItem onClick={handleMarkRecovered}>
            <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
            Marquer guéri
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
