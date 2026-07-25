import { motion } from "framer-motion"
import { useReducedMotion } from "framer-motion"

export function FadeIn({
  children,
  delay = 0,
  className,
  ...props
}: {
  children: React.ReactNode
  delay?: number
  className?: string
} & Omit<React.ComponentProps<typeof motion.div>, "initial" | "animate" | "transition">) {
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.3, delay: reducedMotion ? 0 : delay, ease: "easeOut" }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}
