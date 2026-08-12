import { useMemo } from 'react'
import { useRouter } from '@/app/router'
import { useSelection } from '@/app/selection'
import { useStore } from '@/data/store'

/**
 * What the user is looking at, for the assistant to resolve "this deal" against.
 *
 * Two sources, and the order between them is the whole point: an open record drawer wins over the
 * page behind it. Someone on the deals index with a drawer open is looking at the drawer — asking
 * "why is this at risk?" means the record in front of them, not the list underneath.
 *
 * Only ids and labels leave here. The label is for the chip in the drawer header so the user can
 * see what the assistant thinks they mean; the id is what the server re-resolves through the
 * caller's own permissions. Nothing here is trusted on the way in.
 */

export interface ScreenContext {
  type: 'deal' | 'lead' | 'account'
  id: string
  /** What to show the user, e.g. "Acme Corp — Manufacturing". */
  label: string
  /** The kind, in words, for the chip. */
  kindLabel: string
}

export function useScreenContext(): ScreenContext | null {
  const { match } = useRouter()
  const { selection } = useSelection()
  const { snapshot } = useStore()

  return useMemo(() => {
    const describe = (type: ScreenContext['type'], id: string): ScreenContext | null => {
      if (type === 'deal') {
        const deal = snapshot.deals.find((candidate) => candidate.id === id)
        if (!deal) return null
        const account = snapshot.accounts.find((candidate) => candidate.id === deal.accountId)
        return {
          type,
          id,
          label: account ? `${deal.name} · ${account.name}` : deal.name,
          kindLabel: 'Deal',
        }
      }

      if (type === 'lead') {
        const lead = snapshot.leads.find((candidate) => candidate.id === id)
        if (!lead) return null
        const account = snapshot.accounts.find((candidate) => candidate.id === lead.accountId)
        return {
          type,
          id,
          label: account ? `${account.name} · ${lead.businessUnit}` : lead.businessUnit,
          kindLabel: 'Business unit',
        }
      }

      const account = snapshot.accounts.find((candidate) => candidate.id === id)
      if (!account) return null
      return {
        type,
        id,
        label: account.name,
        kindLabel: 'Account',
      }
    }

    // The drawer is nearer the user's attention than the route behind it.
    // Contacts are skipped: the assistant's tools reach accounts, leads and deals, so naming a
    // contact as context would promise a lookup it cannot perform.
    if (selection && selection.type !== 'contact') return describe(selection.type, selection.id)

    // A deal page is a route rather than a drawer, so it is the other place context comes from.
    if (match.name === 'deal' && match.params.dealId) {
      return describe('deal', match.params.dealId)
    }

    return null
  }, [match, selection, snapshot])
}

/**
 * Prompts worth offering when a record is in view.
 *
 * Different questions from the pipeline-wide ones, because the useful question about a single deal
 * is never "how big is my pipeline". Each maps onto something `deal_detail` can actually answer, so
 * a suggestion cannot lead to "I can't do that".
 */
export function contextualPrompts(context: ScreenContext): string[] {
  if (context.type === 'deal') {
    return [
      'Why is this deal where it is?',
      "What's happened on this deal recently?",
      'What should I do next on this one?',
    ]
  }
  if (context.type === 'lead') {
    return [
      'How is this business unit doing?',
      'Which of its deals need attention?',
      'What was the last activity here?',
    ]
  }
  return [
    'Summarise this account for me',
    'Which of its deals are at risk?',
    'How much open pipeline does it have?',
  ]
}
