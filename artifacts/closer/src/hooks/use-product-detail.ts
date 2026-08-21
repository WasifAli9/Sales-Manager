import { useListAnalyses, useRunStrategist, useListPlatformStates, useUpdatePlatformState, getListAnalysesQueryKey, getListPlatformStatesQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"

export function useProductDetailData(productId: number) {
  const analyses = useListAnalyses({ productId }, { query: { enabled: !!productId, queryKey: getListAnalysesQueryKey({ productId }) } })
  const platformStates = useListPlatformStates({ productId }, { query: { enabled: !!productId, queryKey: getListPlatformStatesQueryKey({ productId }) } })
  
  return { analyses, platformStates }
}

export function useProductDetailMutations(productId: number) {
  const queryClient = useQueryClient()

  const runStrat = useRunStrategist({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAnalysesQueryKey({ productId }) })
    }
  })

  const updatePlatform = useUpdatePlatformState({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPlatformStatesQueryKey({ productId }) })
    }
  })

  return { runStrategist: runStrat, updatePlatformState: updatePlatform }
}
