import { motion, AnimatePresence } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
  chapter: string;
  chapterTitle: string;
  content: string;
}

export function WhitenessModal({ open, onClose, chapter, chapterTitle, content }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-xl w-full max-h-[80vh] rounded-lg shadow-2xl overflow-hidden"
            style={{ background: "linear-gradient(180deg, #2a1f0e 0%, #1a150a 100%)" }}
          >
            {/* Header */}
            <div className="px-8 pt-6 pb-4 border-b border-amber-900/40">
              <div className="flex items-center justify-between">
                <h2
                  className="text-2xl text-amber-200"
                  style={{ fontFamily: "'Pirata One', cursive" }}
                >
                  {chapter}
                </h2>
                <button
                  onClick={onClose}
                  className="text-amber-700 hover:text-amber-400 text-xl leading-none px-2 transition-colors"
                >
                  x
                </button>
              </div>
              <p
                className="text-lg text-amber-400/80 mt-1"
                style={{ fontFamily: "'Pirata One', cursive" }}
              >
                {chapterTitle}
              </p>
            </div>

            {/* Body — scrollable */}
            <div className="px-8 py-6 overflow-y-auto max-h-[58vh]">
              {content.split("\n\n").map((para, i) => (
                <p
                  key={i}
                  className="text-sm text-amber-100/80 italic leading-relaxed mb-5 last:mb-0"
                >
                  {para}
                </p>
              ))}
            </div>

            {/* Footer */}
            <div className="px-8 py-4 border-t border-amber-900/40 text-center">
              <p className="text-xs text-amber-700 italic">
                Herman Melville, Moby-Dick; or, The Whale (1851)
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
