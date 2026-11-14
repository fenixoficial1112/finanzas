export function Logo({ claro = false }: { claro?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-marca">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />
        </svg>
      </span>
      <span className={`text-lg font-bold tracking-tight ${claro ? 'text-white' : 'text-tinta'}`}>
        FENIX APP
      </span>
    </div>
  )
}
