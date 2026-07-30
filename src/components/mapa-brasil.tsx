import { useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

// TopoJSON do Brasil com divisão por estados
const BRAZIL_TOPO_JSON = "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson";

export interface EstadoData {
  entrada: number;
  saida: number;
}

interface MapaBrasilProps {
  data: Record<string, EstadoData>;
  onSelectState?: (uf: string) => void;
}

export function MapaBrasil({ data, onSelectState }: MapaBrasilProps) {
  const [tooltip, setTooltip] = useState<{
    uf: string;
    name: string;
    entrada: number;
    saida: number;
    x: number;
    y: number;
  } | null>(null);

  // Escala de cores baseada no total de chamadas
  const getColor = (total: number) => {
    if (total === 0) return "#e2e8f0"; // slate-200 (sem chamadas para o estado)
    if (total < 50) return "#a7f3d0";  // emerald-200
    if (total < 100) return "#6ee7b7"; // emerald-300
    if (total < 200) return "#34d399"; // emerald-400
    if (total < 300) return "#10b981"; // emerald-500
    if (total < 500) return "#059669"; // emerald-600
    return "#047857";                  // emerald-700
  };

  return (
    <div className="relative w-full border rounded-xl bg-card p-4 shadow-sm flex flex-col items-center">
      {/* Legenda */}
      <div className="w-full flex justify-between items-center mb-2">
        <h3 className="font-semibold text-sm">Distribuição de Chamadas por Estado</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>0</span>
          <span className="w-3 h-3 rounded-sm bg-[#e2e8f0]" />
          <span className="w-3 h-3 rounded-sm bg-[#a7f3d0]" />
          <span className="w-3 h-3 rounded-sm bg-[#34d399]" />
          <span className="w-3 h-3 rounded-sm bg-[#10b981]" />
          <span className="w-3 h-3 rounded-sm bg-[#047857]" />
          <span>500+</span>
        </div>
      </div>

      <div className="relative w-full max-w-[550px] aspect-[4/3]">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{
            scale: 700,
            center: [-54, -15],
          }}
          className="w-full h-full"
        >
          <Geographies geography={BRAZIL_TOPO_JSON}>
            {({ geographies }) =>
              geographies.map((geo) => {
                // Captura a sigla do estado no GeoJSON
                const uf = String(
                  geo.properties.sigla ||
                  geo.properties.UF ||
                  geo.properties.id ||
                  geo.id ||
                  ""
                ).toUpperCase().trim();

                const name = geo.properties.name || geo.properties.nome || uf;
                
                // Busca no mapaData usando a sigla em caixa alta (ex: "ES")
                const ufData = data[uf] || { entrada: 0, saida: 0 };
                const total = ufData.entrada + ufData.saida;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => { if (onSelectState) onSelectState(uf);}}
                    fill={getColor(total)}
                    stroke="#ffffff"
                    strokeWidth={1}
                    style={{
                      default: { outline: "none", transition: "all 0.2s" },
                      hover: { outline: "none", fill: "#0284c7", cursor: "pointer" },
                      pressed: { outline: "none" },
                    }}
                    onMouseMove={(evt) => {
                      setTooltip({
                        uf,
                        name,
                        entrada: ufData.entrada,
                        saida: ufData.saida,
                        x: evt.clientX,
                        y: evt.clientY,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>

        {/* Tooltip no Hover */}
        {tooltip && (
          <div
            className="fixed z-50 pointer-events-none bg-popover text-popover-foreground border px-3 py-2 rounded-lg shadow-lg text-xs space-y-1 backdrop-blur-sm bg-opacity-95"
            style={{
              left: `${tooltip.x + 12}px`,
              top: `${tooltip.y + 12}px`,
            }}
          >
            <p className="font-bold border-b pb-1 text-sm">
              {tooltip.name} {tooltip.uf ? `(${tooltip.uf})` : ""}
            </p>
            <div className="flex justify-between gap-4 text-emerald-600 font-medium">
              <span>Entrada:</span>
              <span>{tooltip.entrada}</span>
            </div>
            <div className="flex justify-between gap-4 text-blue-600 font-medium">
              <span>Saída:</span>
              <span>{tooltip.saida}</span>
            </div>
            <div className="flex justify-between gap-4 font-bold border-t pt-1 text-foreground">
              <span>Total:</span>
              <span>{tooltip.entrada + tooltip.saida}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
