import { useGetTodaySummary, useListActivities, useUpdateActivity, useCreateActivity, useGenerateActivities, useCreateReflection, getGetTodaySummaryQueryKey, getListActivitiesQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { getTodayStr } from "@/lib/date"

export function useTodayData() {
  const today = getTodayStr()
  const summary = useGetTodaySummary({ date: today })
  const activities = useListActivities({ date: today })
  const stillOpen = useListActivities({ status: "pending", beforeDate: today })

  return {
    today,
    summary,
    activities,
    stillOpen,
  }
}

function invalidateTodayQueries(queryClient: ReturnType<typeof useQueryClient>, today: string) {
  queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date: today }) })
  queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ status: "pending", beforeDate: today }) })
  queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey({ date: today }) })
}

export function useTodayMutations() {
  const queryClient = useQueryClient()
  const today = getTodayStr()

  const updateAct = useUpdateActivity({
    mutation: {
      onSuccess: () => invalidateTodayQueries(queryClient, today),
    }
  })

  const createAct = useCreateActivity({
    mutation: {
      onSuccess: () => invalidateTodayQueries(queryClient, today),
    }
  })

  const generateAct = useGenerateActivities({
    mutation: {
      onSuccess: () => invalidateTodayQueries(queryClient, today),
    }
  })

  const createReflect = useCreateReflection({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey({ date: today }) })
      }
    }
  })

  return {
    updateActivity: updateAct,
    createActivity: createAct,
    generateActivities: generateAct,
    createReflection: createReflect
  }
}
