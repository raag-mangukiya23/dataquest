// Temporary placeholder for a screen that is not built yet.
import { Construction } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/ui'

export function PageStub({ title, note }: { title: string; note?: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState icon={<Construction className="h-6 w-6" />} title="Coming soon">
        {note ?? 'This screen is being built.'}
      </EmptyState>
    </div>
  )
}
