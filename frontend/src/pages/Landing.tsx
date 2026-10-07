// Public landing page: the "light through a prism" first impression, then what PRISM does and why it can be trusted.
// Real figures (score weights, fairness checks, catalogue size, service status) come from public endpoints and only
// appear once fetched; everything else is copy.
import { useEffect } from 'react'
import { ScrollHero, StaticHero, type HeroData } from '@/components/landing/Hero'
import { SceneStyles } from '@/components/landing/PrismScene'
import { Different, Explainers, FinalCta, HowStrip, SiteFooter } from '@/components/landing/sections'
import { pickShowcase, useCatalogCareers, useFairness, useHealth, useMediaQuery, useMethodology } from '@/components/landing/util'
import { useSettings } from '@/state/settings'

export default function Landing() {
  const { reducedMotion } = useSettings()
  const desktop = useMediaQuery('(min-width: 768px)')
  const methodology = useMethodology()
  const fairness = useFairness()
  const health = useHealth()
  const careers = useCatalogCareers()

  useEffect(() => {
    document.title = 'PRISM · See every path. Choose yours together.'
  }, [])

  const items = careers.data?.items
  const data: HeroData = {
    careers: pickShowcase(items),
    careerTotal: careers.data?.total,
    sectorCount: items ? new Set(items.map((c) => c.sector)).size : undefined,
    weights: methodology.data?.weights,
    fairness: fairness.data,
    fairnessLoading: fairness.isLoading,
    catalogLoading: careers.isLoading,
  }

  return (
    <>
      <SceneStyles />
      {desktop && !reducedMotion ? <ScrollHero data={data} /> : <StaticHero data={data} wide={desktop} />}
      <Explainers />
      <Different methodology={methodology.data} methodologyLoading={methodology.isLoading} fairness={fairness.data} fairnessLoading={fairness.isLoading} />
      <HowStrip dimensionCount={methodology.data?.dimensions.length} />
      <FinalCta />
      <SiteFooter health={health.data} healthError={health.isError} />
    </>
  )
}
