import * as React from "react"
import { format } from "date-fns"

export function getTodayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function formatDate(date: string | Date, fmt: string = "MMM d, yyyy") {
  return format(new Date(date), fmt)
}
