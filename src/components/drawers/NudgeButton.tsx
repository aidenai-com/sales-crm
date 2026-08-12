import { useState } from 'react'
import { useAuth } from '@/app/auth'
import { useToast } from '@/app/toast'
import { writeApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import type { HealthDetail } from '@/lib/health'
import { cn } from '@/lib/cn'

/**
 * Chases the owner of a deal that has gone wrong.
 *
 * Only rendered for administrators, and only on deals that are actually at risk. Both are
 * enforced by the API as well — this is the affordance, not the rule. A nudge button on a
 * healthy deal would invite a click that can only ever be refused.
 *
 * Deliberately not shown on the admin's *own* deals: nudging yourself sends you an email you
 * already knew about, which is the sort of thing that makes a feature look unconsidered.
 */
export function NudgeButton({
  dealId,
  ownerId,
  ownerName,
  detail,
}: {
  dealId: string
  ownerId: string
  ownerName: string
  detail: HealthDetail
}) {
  const { isAdmin, user } = useAuth()
  const { show } = useToast()
  const [sending, setSending] = useState(false)
  const [sentAt, setSentAt] = useState<string | null>(null)

  const atRisk = detail.health === 'at-risk'
  if (!isAdmin || !atRisk || ownerId === user?.id) return null

  if (sentAt) {
    return (
      <span className="shrink-0 rounded-lg bg-pebble px-8 py-[4px] text-caption font-medium text-slate-gray">
        Nudged
      </span>
    )
  }

  async function send(event: React.MouseEvent) {
    // The row itself opens the deal. Without this a nudge would also navigate away from the
    // list the admin is working through.
    event.stopPropagation()
    setSending(true)
    try {
      const result = await writeApi.nudgeDeal(dealId)
      setSentAt(result.nudgedAt)
      show({
        title: `Nudged ${result.ownerName}`,
        detail: 'They have an email and a reminder in their inbox.',
        tone: 'success',
      })
    } catch (error) {
      // A 409 is the deal being healthy or already nudged — the admin did nothing wrong, so it
      // reads as information rather than as a failure.
      const conflict = error instanceof ApiError && error.status === 409
      show({
        title: conflict ? 'Not nudged' : 'Could not send the nudge',
        detail: error instanceof Error ? error.message : 'Something went wrong.',
        tone: conflict ? 'neutral' : 'danger',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <button
      onClick={send}
      disabled={sending}
      title={`Email ${ownerName} and add a reminder to their inbox`}
      className={cn(
        'shrink-0 rounded-lg px-8 py-[4px] text-caption font-semibold transition-colors duration-hover ease-ui',
        'text-signal-blue hover:bg-badge-fill disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      {sending ? 'Nudging…' : 'Nudge'}
    </button>
  )
}
