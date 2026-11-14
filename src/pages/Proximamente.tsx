export default function Proximamente({ titulo, fase }: { titulo: string; fase: number }) {
  return (
    <div className="max-w-3xl space-y-3">
      <h1 className="text-2xl md:text-3xl font-bold">{titulo}</h1>
      <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-suave">
        Esta sección se construye en la fase {fase}.
      </div>
    </div>
  )
}
