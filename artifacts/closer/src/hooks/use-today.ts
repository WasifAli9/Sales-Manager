import { useGetTodaySummary, useListActivities, useUpdateActivity, useCreateActivity, useGenerateActivities, useCreateReflection, getGetTodaySummaryQueryKey, getListActivitiesQueryKey, Activity, ActivityCategory } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { getTodayStr } from "@/lib/date"

export function useTodayData() {
  const today = getTodayStr()
  const summary = useGetTodaySummary({ date: today })
  const activities = useListActivities({ date: today })
  
  return {
    today,
    summary,
    activities
  }
}

export function useTodayMutations() {
  const queryClient = useQueryClient()
  const today = getTodayStr()

  const updateAct = useUpdateActivity({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date: today }) })
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey({ date: today }) })
      }
    }
  })

  const createAct = useCreateActivity({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date: today }) })
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey({ date: today }) })
      }
    }
  })

  const generateAct = useGenerateActivities({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date: today }) })
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey({ date: today }) })
      }
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
