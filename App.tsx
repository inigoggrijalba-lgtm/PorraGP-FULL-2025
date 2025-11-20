import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { chatWithData } from './services/geminiService';
import { fetchSeasons, fetchRidersBySeason, fetchRiderDetails, fetchLiveTiming, fetchRiderStats, fetchRiderSeasonStats, fetchResultCategories, fetchResultEvents, fetchResultSessions, fetchSessionClassification, fetchAllRiders } from './services/motogpApiService';
import type { MotoGpData, Race, PlayerScore, PlayerVote, DriverVoteCount, ChatMessage, RaceResult, CircuitResult, Article, ApiSeason, ApiRider, LiveTimingHead, RiderStats, RiderSeasonStat, ApiCategoryResult, ApiEventResult, ApiSessionResult, ApiClassificationItem } from './types';
import { TrophyIcon, TableIcon, SparklesIcon, SendIcon, RefreshIcon, FlagIcon, UserIcon, PencilSquareIcon, MenuIcon, XIcon, NewspaperIcon, AppleIcon, AndroidIcon, IosShareIcon, AddToScreenIcon, AppleAppStoreBadge, GooglePlayBadge, CameraIcon, ShareIcon, DownloadIcon, FullscreenIcon, FullscreenExitIcon } from './components/icons';

declare var html2canvas: any;

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQAqF8HCmEs0iGvEO0jItWZl_PfIF2Igy8PoNhEnQjB-C92vCyWvSMRB00FpsNseEA8T-7Ip4GfDPf3/pub?gid=0&single=true&output=csv';

const RIDER_COLORS: Record<string, string> = {
    // Rojo Intenso
    'Bagnaia': '#D40000', 'M.Marquez': '#D40000',
    // Verde
    'Martin': '#00A651', 'Bezzecchi': '#00A651',
    // Azul Clarisimo
    'A.Marquez': '#75C9D9', 'Aldeguer': '#75C9D9',
    // Blanco
    'Zarco': '#FFFFFF', 'Chantra': '#FFFFFF',
    // Azul Intenso
    'Quartararo': '#0033A0', 'Rins': '#0033A0',
    // Amarillo
    'Di Giannantonio': '#FDEE00', 'Morbidelli': '#FDEE00',
    // Morado
    'Oliveira': '#8A2BE2', 'Miller': '#8A2BE2',
    // Naranja
    'Binder': '#FF6600', 'Acosta': '#FF6600', 'Bastianini': '#FF6600', 'Viñales': '#FF6600',
    // Naranja Clarito
    'Marini': '#f58025', 'Mir': '#f58025',
    // Azul
    'R.Fernandez': '#002868', 'Fernandez': '#002868', 'Ogura': '#002868',
    'DEFAULT': '#4B5563',
};

// Paleta de colores para la gráfica de estadísticas
const PLAYER_CHART_COLORS = [
    '#34D399', '#F87171', '#60A5FA', '#FBBF24', '#A78BFA',
    '#F472B6', '#2DD4BF', '#F97316', '#EC4899', '#14B8A6',
    '#8B5CF6', '#D946EF', '#6EE7B7'
];

const getRiderColor = (riderName: string): string => {
    // Normalize the input name by making it lowercase and removing spaces and dots for robust matching.
    const normalizedRiderName = riderName.toLowerCase().replace(/[.\s]/g, '');
    let bestMatchKey: string | null = null;
    let bestMatchLength = 0;

    for (const key of Object.keys(RIDER_COLORS)) {
        if (key === 'DEFAULT') continue;

        // Normalize the key from the color map in the same way.
        const normalizedKey = key.toLowerCase().replace(/[.\s]/g, '');

        // Check if the normalized data name includes the normalized key.
        // This allows matching "rfernandez" from data to the key "fernandez".
        if (normalizedRiderName.includes(normalizedKey)) {
            // If it's a match, see if it's better than the current best match.
            // A longer key is a more specific, and therefore better, match.
            if (normalizedKey.length > bestMatchLength) {
                bestMatchKey = key;
                bestMatchLength = normalizedKey.length;
            }
        }
    }

    return bestMatchKey ? RIDER_COLORS[bestMatchKey] : RIDER_COLORS.DEFAULT;
};


const parseCsvData = (csvText: string): MotoGpData => {
    const lines = csvText.trim().replace(/\r/g, '').split('\n');
    const dataGrid = lines.map(line => line.split(','));

    // --- Carreras ---
    const raceDates = dataGrid[0].slice(2, 24);
    const raceTimes = dataGrid[1].slice(2, 24);
    const raceCircuits = dataGrid[2].slice(2, 24);
    const races: Race[] = raceCircuits.map((circuit, i) => ({
        circuit: circuit.trim(),
        date: raceDates[i]?.trim() || 'TBC',
        time: raceTimes[i]?.trim() || 'TBC',
    })).filter(r => r.circuit);

    // --- Clasificación ---
    const standings: PlayerScore[] = [];
    for (let i = 3; i < 16; i++) {
        if (!dataGrid[i] || !dataGrid[i][0]) continue;
        const row = dataGrid[i];
        const pointsPerRace = row.slice(2, 24).map(p => parseFloat(p) || 0);
        // Se calcula el total de puntos sumando los puntos de cada carrera,
        // ignorando el total precalculado en la hoja de cálculo.
        const totalPoints = pointsPerRace.reduce((sum, current) => sum + current, 0);
        standings.push({
            player: row[0].trim(),
            totalPoints: totalPoints,
            pointsPerRace: pointsPerRace,
        });
    }
    standings.sort((a, b) => b.totalPoints - a.totalPoints);


    // --- Votos de Jugadores ---
    const playerVotes: PlayerVote[] = [];
    for (let i = 17; i < 30; i++) {
        if (!dataGrid[i] || !dataGrid[i][0]) continue;
        const row = dataGrid[i];
        playerVotes.push({
            player: row[0].trim(),
            votesPerRace: row.slice(2, 24).map(v => v.trim()),
        });
    }

    // --- Recuento de Votos por Piloto ---
    const driverVoteCounts: DriverVoteCount[] = [];
    const allDrivers = dataGrid[32].slice(2).map(d => d.trim()).filter(Boolean);
    for (let i = 33; i < 46; i++) {
        if (!dataGrid[i] || !dataGrid[i][2]) continue;
        const playerRow = dataGrid[i];
        const votingPlayer = playerRow[0].trim();
        const votes = playerRow.slice(2);

        votes.forEach((countStr, j) => {
            const driverName = allDrivers[j];
            if (!driverName) return;
            const count = parseInt(countStr) || 0;
            if (count > 0) {
                let driver = driverVoteCounts.find(d => d.driver === driverName);
                if (!driver) {
                    driver = { driver: driverName, votesByPlayer: {}, totalVotes: 0 };
                    driverVoteCounts.push(driver);
                }
                driver.votesByPlayer[votingPlayer] = count;
                driver.totalVotes += count;
            }
        });
    }
     // Asegurarse de que todos los pilotos estén en la lista, incluso con 0 votos
    allDrivers.forEach(driverName => {
        if (!driverVoteCounts.some(d => d.driver === driverName)) {
            driverVoteCounts.push({ driver: driverName, votesByPlayer: {}, totalVotes: 0 });
        }
    });

    driverVoteCounts.sort((a, b) => b.totalVotes - a.totalVotes);

    // --- Resultados Oficiales MotoGP ---
    const motogpResults: CircuitResult[] = [];
    const sprintPoints = [12, 9, 7, 6, 5, 4, 3, 2, 1];
    const racePoints = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

    races.forEach((race, raceIndex) => {
        const columnIndex = raceIndex + 2;
        const sprintResults: RaceResult[] = [];
        // SPRINT results from row 50 (index 49)
        for (let i = 0; i < 10; i++) {
            const driverRow = 49 + i;
            if (dataGrid[driverRow] && dataGrid[driverRow][columnIndex]?.trim()) {
                sprintResults.push({
                    position: i + 1,
                    driver: dataGrid[driverRow][columnIndex].trim(),
                    points: sprintPoints[i] || 0,
                });
            }
        }

        const raceResults: RaceResult[] = [];
        // RACE results from row 60 (index 59)
        for (let i = 0; i < 10; i++) {
            const driverRow = 59 + i;
            if (dataGrid[driverRow] && dataGrid[driverRow][columnIndex]?.trim()) {
                raceResults.push({
                    position: i + 1,
                    driver: dataGrid[driverRow][columnIndex].trim(),
                    points: racePoints[i] || 0,
                });
            }
        }

        motogpResults.push({
            circuit: race.circuit,
            sprint: sprintResults,
            race: raceResults,
        });
    });

    return { races, standings, playerVotes, driverVoteCounts, motogpResults, allDrivers };
};


type Tab = 'dashboard' | 'standings' | 'statistics' | 'circuits' | 'participantes' | 'votar' | 'livetiming' | 'noticias' | 'motogp_data';

const TABS: { name: string; tab: Tab }[] = [
    { name: "Inicio", tab: "dashboard" },
    { name: "Clasificación Porra", tab: "standings" },
    { name: "Votar", tab: "votar" },
    { name: "Resultados Porra", tab: "circuits" },
    { name: "MotoGP Data", tab: "motogp_data" },
    { name: "Votos pilotos", tab: "participantes" },
    { name: "Estadísticas", tab: "statistics" },
    { name: "Noticias", tab: "noticias" },
];

// Se ha extraído el botón de actualizar a su propio componente para mayor claridad y reutilización.
function RefreshButton({ onClick, isLoading }: { onClick: () => void; isLoading: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={isLoading}
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center disabled:bg-gray-500 disabled:cursor-not-allowed"
            aria-label={isLoading ? "Cargando datos" : "Actualizar datos"}
        >
            <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''} mr-2`} />
            <span className="hidden sm:inline">{isLoading ? '...' : 'Actualizar'}</span>
        </button>
    );
}

interface TabButtonProps {
    name: string;
    tab: Tab;
    activeTab: Tab;
    setActiveTab: (tab: Tab) => void;
}

const TabButton: React.FC<TabButtonProps> = ({ name, tab, activeTab, setActiveTab}) => {
    return (
        <button
            onClick={() => setActiveTab(tab)}
            className={`${
                activeTab === tab
                ? 'border-red-500 motogp-red'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
        >
            {name}
        </button>
    )
}

function InstallAppCard({ onOpenModal }: { onOpenModal: (os: 'android' | 'ios') => void }) {
    return (
        <div className="mt-8">
            <div 
                className="p-6 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-6 border border-white/50" 
                style={{
                    backgroundColor: 'rgba(55, 55, 55, 0.8)',
                    backdropFilter: 'blur(10px)',
                }}
            >
                <h2 className="font-orbitron text-xl text-white text-center sm:text-left">
                    <span className="motogp-red">Descarga</span> la aplicación<br/>oficial de Porra<span className="motogp-red">GP</span>™
                </h2>
                <div className="flex items-center gap-4">
                    <button onClick={() => onOpenModal('ios')} className="transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white rounded-lg" aria-label="Instalar en Apple">
                        <AppleAppStoreBadge className="h-12" />
                    </button>
                    <button onClick={() => onOpenModal('android')} className="transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white rounded-lg" aria-label="Instalar en Android">
                        <GooglePlayBadge className="h-12" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function InstallInstructionsModal({ os, onClose }: { os: 'android' | 'ios'; onClose: () => void; }) {
    const isAndroid = os === 'android';
    const title = isAndroid ? 'Instalar en Android' : 'Instalar en iPhone/iPad';
    const icon = isAndroid ? <AndroidIcon className="w-10 h-10 text-green-400" /> : <AppleIcon className="w-10 h-10 text-blue-400" />;
    
    const instructions = isAndroid ? (
        <ol className="list-decimal list-inside space-y-3 text-gray-200">
            <li>Haz clic en los <strong>tres puntitos</strong> de la parte alta del navegador.</li>
            <li>Busca y selecciona la opción <strong>"Añadir a pantalla de inicio"</strong>.</li>
            <li>Pulsa en <strong>"Instalar"</strong>.</li>
            <li>¡Listo! Ya puedes acceder a PorraGP como una app más.</li>
        </ol>
    ) : (
        <ol className="list-decimal list-inside space-y-3 text-gray-200">
            <li>Abre esta página en <strong>Safari</strong>.</li>
            <li>Pulsa el botón de <strong>Compartir</strong> <IosShareIcon className="w-5 h-5 inline-block mx-1" />.</li>
            <li>Busca y selecciona la opción <strong>"Añadir a pantalla de inicio"</strong> <AddToScreenIcon className="w-5 h-5 inline-block mx-1" />.</li>
            <li>Confirma pulsando en "Añadir".</li>
        </ol>
    );

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="card-bg rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="font-orbitron text-lg text-white">{title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-2 bg-gray-800 rounded-lg flex-shrink-0">{icon}</div>
                        <p className="text-gray-300">Sigue estos sencillos pasos para tener acceso directo a la aplicación.</p>
                    </div>
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                        {instructions}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, metric, icon }: { title: string, value: string, metric: string, icon: React.ReactNode }) {
    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-4 border-t-4 border-red-600 hover:bg-gray-800/60 transition-colors duration-300">
            <div className="p-3 bg-gray-700/50 rounded-lg text-red-500">
                {icon}
            </div>
            <div>
                <p className="text-sm text-gray-400">{title}</p>
                <p className="text-lg sm:text-2xl font-bold text-white font-orbitron truncate">{value}</p>
                <p className="text-xs sm:text-sm text-green-500">{metric}</p>
            </div>
        </div>
    );
}

interface PlayerVoteCardProps {
    player: string;
    vote: string;
    onClick: () => void;
}

const PlayerVoteCard: React.FC<PlayerVoteCardProps> = ({ player, vote, onClick }) => {
    const riderColor = getRiderColor(vote);
    return (
        <div 
            onClick={onClick}
            className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex items-center justify-between hover:bg-gray-800 cursor-pointer transition-colors group"
        >
            <div className="flex items-center gap-3">
                <div className="w-2 h-10 rounded-full" style={{ backgroundColor: riderColor }}></div>
                <div>
                    <p className="font-bold text-white group-hover:text-red-400 transition-colors">{player}</p>
                    <p className="text-sm text-gray-400">Voto: <span className="text-white font-medium">{vote}</span></p>
                </div>
            </div>
        </div>
    );
}

function PlayerVoteDetailsModal({ player, data, onClose }: { player: string; data: MotoGpData; onClose: () => void }) {
    const playerVotes = data.playerVotes.find(p => p.player === player);
    const score = data.standings.find(p => p.player === player);

    if (!playerVotes || !score) return null;

    const voteCounts: Record<string, number> = {};
    playerVotes.votesPerRace.forEach(vote => {
        if (vote && vote !== '-') {
            voteCounts[vote] = (voteCounts[vote] || 0) + 1;
        }
    });

    const sortedVotes = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="card-bg rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="font-orbitron text-xl text-white">{player}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <div className="p-6 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-gray-800 p-3 rounded-lg text-center">
                            <p className="text-gray-400 text-xs uppercase">Puntos Totales</p>
                            <p className="text-2xl font-bold text-white font-orbitron">{score.totalPoints}</p>
                        </div>
                        <div className="bg-gray-800 p-3 rounded-lg text-center">
                            <p className="text-gray-400 text-xs uppercase">Pilotos Votados</p>
                            <p className="text-2xl font-bold text-white font-orbitron">{Object.keys(voteCounts).length}</p>
                        </div>
                    </div>

                    <h3 className="text-lg font-bold text-white mb-3">Historial de Votos</h3>
                    <div className="space-y-2">
                        {sortedVotes.map(([driver, count]) => (
                            <div key={driver} className="flex items-center justify-between bg-gray-800/50 p-2 rounded border border-gray-700">
                                <div className="flex items-center gap-3">
                                    <div className="w-1 h-8 rounded" style={{ backgroundColor: getRiderColor(driver) }}></div>
                                    <span className="text-white font-medium">{driver}</span>
                                </div>
                                <span className="text-gray-400 font-bold">{count}x</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ScreenshotModal({ imageDataUrl, onClose }: { imageDataUrl: string; onClose: () => void; }) {
    const [canShare, setCanShare] = useState(false);

    useEffect(() => {
        if (navigator.share) {
            setCanShare(true);
        }
    }, []);
    
    const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
        const res = await fetch(dataUrl);
        return await res.blob();
    };

    const handleShare = async () => {
        if (!navigator.share) {
            alert("Tu navegador no soporta la función de compartir. Por favor, descarga la imagen y compártela manualmente.");
            return;
        }

        try {
            const blob = await dataUrlToBlob(imageDataUrl);
            const file = new File([blob], 'clasificacion-porragp.png', { type: 'image/png' });
            
            await navigator.share({
                title: 'Clasificación PorraGP',
                text: '¡Así va la clasificación de la PorraGP!',
                files: [file],
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };
    
    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = imageDataUrl;
        link.download = 'clasificacion-porragp.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="card-bg rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <h2 className="font-orbitron text-lg text-white">Vista Previa</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <div className="flex-1 p-4 overflow-y-auto">
                    <img src={imageDataUrl} alt="Captura de la clasificación" className="w-full h-auto rounded-md border border-gray-600" />
                </div>
                <footer className="p-4 border-t border-gray-700 flex flex-wrap justify-center sm:justify-end gap-3 flex-shrink-0">
                    <button 
                        onClick={handleDownload}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center"
                    >
                       <DownloadIcon className="w-5 h-5 mr-2" /> Descargar
                    </button>
                    {canShare && (
                        <button 
                             onClick={handleShare}
                             className="motogp-red-bg hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center"
                        >
                            <ShareIcon className="w-5 h-5 mr-2" /> Compartir
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
}

function EvolutionChart({ data, selectedPlayers, playerColors }: {
    data: MotoGpData;
    selectedPlayers: string[];
    playerColors: Map<string, string>;
}) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const container = chartContainerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver(entries => {
            if (entries[0]) {
                const { width } = entries[0].contentRect;
                // Maintain a 2:1 aspect ratio, but with a minimum height for small screens
                const height = Math.max(width / 2, 250);
                setDimensions({ width, height });
            }
        });

        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, []);

    const chartData = useMemo(() => {
        const racesWithPoints = data.races.filter((_, raceIndex) => 
            data.standings.some(player => player.pointsPerRace[raceIndex] > 0)
        );

        if (racesWithPoints.length === 0) {
            return { races: [], series: [] };
        }

        const series = data.standings
            .filter(player => selectedPlayers.includes(player.player))
            .map(player => {
                let cumulativePoints = 0;
                const points = racesWithPoints.map((_, raceIndex) => {
                    const originalIndex = data.races.findIndex(r => r.circuit === racesWithPoints[raceIndex].circuit);
                    cumulativePoints += player.pointsPerRace[originalIndex] || 0;
                    return cumulativePoints;
                });
                return {
                    name: player.player,
                    data: points,
                    color: playerColors.get(player.player) || '#888'
                };
            });

        return {
            races: racesWithPoints.map(r => r.circuit.substring(0, 3).toUpperCase()),
            series: series,
        };
    }, [data, selectedPlayers, playerColors]);

    const PADDING = { top: 20, right: 20, bottom: 40, left: 40 };
    const SVG_WIDTH = dimensions.width;
    const SVG_HEIGHT = dimensions.height;
    const CHART_WIDTH = SVG_WIDTH > PADDING.left + PADDING.right ? SVG_WIDTH - PADDING.left - PADDING.right : 0;
    const CHART_HEIGHT = SVG_HEIGHT > PADDING.top + PADDING.bottom ? SVG_HEIGHT - PADDING.top - PADDING.bottom : 0;


    const maxY = useMemo(() => {
        const maxPoint = Math.max(0, ...chartData.series.flatMap(s => s.data));
        return Math.ceil(maxPoint / 50) * 50 || 50; // Round up to nearest 50
    }, [chartData]);
    
    if (chartData.races.length === 0) {
        return <div className="text-center py-10 text-gray-400">No hay datos de carreras para mostrar la evolución.</div>
    }

    const xScale = (index: number) => PADDING.left + (index / (chartData.races.length - 1)) * CHART_WIDTH;
    const yScale = (value: number) => PADDING.top + CHART_HEIGHT - (value / maxY) * CHART_HEIGHT;

    const generatePath = (points: number[]) => {
        if (chartData.races.length <= 1) { // Cannot draw a line with less than 2 points
             const point = points.length > 0 ? points[0] : 0;
             return `M ${xScale(0)} ${yScale(point)}`;
        }
        return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p)}`).join(' ');
    };

    return (
        <div ref={chartContainerRef} className="w-full">
            {SVG_WIDTH > 0 && (
                <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}>
                    {/* Y-Axis Grid Lines and Labels */}
                    {[...Array(6)].map((_, i) => {
                        const y = PADDING.top + (i * CHART_HEIGHT / 5);
                        const value = maxY - (i * maxY / 5);
                        return (
                            <g key={i}>
                                <line x1={PADDING.left} x2={PADDING.left + CHART_WIDTH} y1={y} y2={y} stroke="#4A5568" strokeDasharray="2" />
                                <text x={PADDING.left - 8} y={y + 4} fill="#A0AEC0" textAnchor="end" fontSize="10">{value}</text>
                            </g>
                        );
                    })}

                    {/* X-Axis Labels */}
                    {chartData.races.map((race, i) => (
                        <text key={race} x={xScale(i)} y={SVG_HEIGHT - PADDING.bottom + 15} fill="#A0AEC0" textAnchor="middle" fontSize="10">
                            {race}
                        </text>
                    ))}
                    
                    {/* Data Lines and Points */}
                    {chartData.series.map(series => (
                        <g key={series.name}>
                            <path d={generatePath(series.data)} fill="none" stroke={series.color} strokeWidth="2" />
                            {series.data.map((point, i) => (
                                <circle key={i} cx={xScale(i)} cy={yScale(point)} r="3" fill={series.color} />
                            ))}
                        </g>
                    ))}
                </svg>
            )}
        </div>
    );
}

function VotesChart({ data }: { data: { driver: string; count: number }[] }) {
    const maxVotes = Math.max(...data.map(d => d.count), 1);
    const activeData = data.filter(d => d.count > 0).sort((a, b) => b.count - a.count);

    if (activeData.length === 0) {
        return <p className="text-gray-400 text-center py-8">Este jugador aún no ha votado.</p>;
    }

    return (
        <div className="space-y-3">
            {activeData.map(item => (
                <div key={item.driver} className="relative">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-white font-bold">{item.driver}</span>
                        <span className="text-gray-400">{item.count} votos</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                        <div 
                            className="h-2.5 rounded-full transition-all duration-500"
                            style={{ 
                                width: `${(item.count / maxVotes) * 100}%`,
                                backgroundColor: getRiderColor(item.driver)
                            }}
                        ></div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ChatBubbleButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="fixed bottom-6 right-6 bg-red-600 hover:bg-red-500 text-white p-4 rounded-full shadow-lg z-40 transition-transform hover:scale-110 flex items-center justify-center"
            aria-label="Abrir Chat de Asistente"
        >
            <SparklesIcon className="w-6 h-6" />
        </button>
    );
}

function ChatWindow({ onClose, data, rawCsv }: { onClose: () => void; data: MotoGpData; rawCsv: string }) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'model', content: '¡Hola! Soy tu asistente de PorraGP. Pregúntame sobre la clasificación, estadísticas o resultados.' }
    ]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;
        
        const userMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsSending(true);

        try {
            const replyText = await chatWithData(data, rawCsv, [...messages, userMessage], userMessage.content);
            setMessages(prev => [...prev, { role: 'model', content: replyText }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'model', content: "Lo siento, hubo un error al procesar tu consulta. Verifica la configuración de la API Key." }]);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-3rem)] h-[500px] max-h-[70vh] card-bg rounded-xl shadow-2xl border border-gray-700 flex flex-col z-50 overflow-hidden">
            <header className="p-4 bg-red-700 flex justify-between items-center">
                <div className="flex items-center gap-2 text-white">
                    <SparklesIcon className="w-5 h-5" />
                    <h3 className="font-bold font-orbitron">Asistente PorraGP</h3>
                </div>
                <button onClick={onClose} className="text-white/80 hover:text-white">
                    <XIcon className="w-6 h-6" />
                </button>
            </header>
            
            <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-gray-900/90">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                            msg.role === 'user' 
                            ? 'bg-red-600 text-white rounded-br-none' 
                            : 'bg-gray-700 text-gray-200 rounded-bl-none'
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {isSending && (
                    <div className="flex justify-start">
                        <div className="bg-gray-700 text-gray-400 p-3 rounded-lg rounded-bl-none text-sm animate-pulse">
                            Escribiendo...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-3 bg-gray-800 border-t border-gray-700 flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Pregunta algo..."
                    className="flex-grow bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <button 
                    onClick={handleSend}
                    disabled={isSending || !input.trim()}
                    className="bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white p-2 rounded-lg transition-colors"
                >
                    <SendIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}

function DashboardTab({ data, setActiveTab }: { data: MotoGpData, setActiveTab: (tab: Tab) => void }) {
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    const [installModalOS, setInstallModalOS] = useState<'android' | 'ios' | null>(null);

    const leader = data.standings && data.standings.length > 0 ? data.standings[0] : undefined;
    const mostVotedDriver = data.driverVoteCounts && data.driverVoteCounts.length > 0 ? data.driverVoteCounts[0] : undefined;
    
    const nextRaceInfo = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const futureRaces = data.races.filter(r => {
            if (!r.date || r.date === 'TBC') return false;
            const parts = r.date.split('/');
            if (parts.length !== 3) return false;
            const [day, month, year] = parts;
            const raceDate = new Date(Number(year), Number(month) - 1, Number(day));
            if (isNaN(raceDate.getTime())) return false;
            return raceDate >= today;
        });

        if (futureRaces.length > 0) {
            return { race: futureRaces[0], seasonOver: false };
        }
        return { race: null, seasonOver: true };
    }, [data.races]);
    
    const votesForNextRace = useMemo(() => {
        if (!nextRaceInfo.race) return [];
        const nextRaceIndex = data.races.findIndex(r => r.circuit === nextRaceInfo.race.circuit);
        if (nextRaceIndex === -1) return [];

        return data.playerVotes.map(playerVote => ({
            player: playerVote.player,
            vote: playerVote.votesPerRace[nextRaceIndex] || '-',
        })).sort((a, b) => a.player.localeCompare(b.player));
    }, [data, nextRaceInfo.race]);

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Líder del Campeonato" value={leader ? leader.player : 'N/A'} metric={leader ? `${leader.totalPoints} Pts` : '-'} icon={<TrophyIcon className="w-6 h-6 sm:w-8 sm:h-8"/>} />
                <StatCard 
                    title="Próxima Carrera" 
                    value={nextRaceInfo.seasonOver ? 'TEMPORADA FINALIZADA' : (nextRaceInfo.race?.circuit ?? 'N/A')} 
                    metric={nextRaceInfo.seasonOver ? 'Gracias por participar' : (nextRaceInfo.race ? `${nextRaceInfo.race.date} - ${nextRaceInfo.race.time}` : 'TBC')} 
                    icon={<FlagIcon className="w-6 h-6 sm:w-8 sm:h-8"/>} 
                />
                <StatCard title="Piloto más Votado (Global)" value={mostVotedDriver ? mostVotedDriver.driver : 'N/A'} metric={mostVotedDriver ? `${mostVotedDriver.totalVotes} Votos` : '-'} icon={<SparklesIcon className="w-6 h-6 sm:w-8 sm:h-8"/>} />
                <button
                    onClick={() => setActiveTab('votar')}
                    className="card-bg p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-4 border-t-4 border-green-500 hover:bg-gray-800/60 hover:shadow-green-900/50 transition-all duration-300 transform hover:-translate-y-1 text-left w-full"
                >
                    <div className="p-2 sm:p-3 bg-gray-700/50 rounded-lg text-green-500">
                        <PencilSquareIcon className="w-6 h-6 sm:w-8 sm:h-8"/>
                    </div>
                    <div>
                        <p className="text-sm text-gray-400">¿Listo para votar?</p>
                        <p className="text-xl sm:text-2xl font-bold text-white font-orbitron">¡A VOTAR!</p>
                        <p className="text-xs sm:text-sm text-green-500">Ir al formulario</p>
                    </div>
                </button>
            </div>

            <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg mb-8">
                <h2 className="font-orbitron text-2xl mb-4 text-white">Votos para la Próxima Carrera: <span className="motogp-red">{nextRaceInfo.race?.circuit ?? 'N/A'}</span></h2>
                {votesForNextRace.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {votesForNextRace.map(({player, vote}) => (
                            <PlayerVoteCard 
                                key={player}
                                player={player}
                                vote={vote}
                                onClick={() => setSelectedPlayer(player)}
                            />
                        ))}
                    </div>
                ) : (
                     <p className="text-gray-400 text-center py-4">{nextRaceInfo.seasonOver ? 'La temporada ha finalizado.' : 'No hay información de votos para la próxima carrera.'}</p>
                )}
            </div>

            <div className="mt-8 mb-8">
                <a 
                    href="https://docs.google.com/spreadsheets/d/1YGSNZagJv0UjxcUhCvIl1BWCJ1v9i91MYBjd1O8S3bM/edit?gid=0#gid=0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card-bg p-6 rounded-xl shadow-lg flex items-center space-x-4 border-t-4 border-green-500 hover:bg-gray-800/60 hover:shadow-green-900/50 transition-all duration-300 transform hover:-translate-y-1 text-left w-full"
                >
                    <div className="p-3 bg-gray-700/50 rounded-lg text-green-500">
                        <TableIcon className="w-8 h-8"/>
                    </div>
                    <div>
                        <p className="text-sm text-gray-400">Consulta los datos brutos</p>
                        <p className="text-2xl font-bold text-white font-orbitron">Acceso a la base de datos</p>
                        <p className="text-sm text-green-500">Abrir Google Sheets</p>
                    </div>
                </a>
            </div>
            
            <InstallAppCard onOpenModal={setInstallModalOS} />

            {selectedPlayer && (
                <PlayerVoteDetailsModal 
                    player={selectedPlayer}
                    data={data}
                    onClose={() => setSelectedPlayer(null)}
                />
            )}
            {installModalOS && (
                <InstallInstructionsModal os={installModalOS} onClose={() => setInstallModalOS(null)} />
            )}
        </>
    );
}


function StandingsTab({ data }: { data: MotoGpData }) {
    const tableRef = useRef<HTMLDivElement>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [screenshot, setScreenshot] = useState<string | null>(null);

    const { currentRaceNumber, totalRaces } = useMemo(() => {
        const total = data.races.length;
        let lastRaceIndex = -1;
        for (let i = total - 1; i >= 0; i--) {
            if (data.standings.some(player => player.pointsPerRace[i] > 0)) {
                lastRaceIndex = i;
                break;
            }
        }
        return { currentRaceNumber: lastRaceIndex + 1, totalRaces: total };
    }, [data]);

    const leaderPoints = data.standings[0]?.totalPoints ?? 0;

    const getPositionClass = (index: number) => {
        switch (index) {
            case 0: return 'bg-yellow-500 hover:bg-yellow-400 text-black';
            case 1: return 'bg-gray-400 hover:bg-gray-300 text-black';
            case 2: return 'bg-yellow-700 hover:bg-yellow-600 text-white';
            default: return 'bg-gray-600 hover:bg-gray-500 text-white';
        }
    };
    
    const handleCaptureScreenshot = async () => {
        if (!tableRef.current) return;
        setIsCapturing(true);
        try {
            const canvas = await html2canvas(tableRef.current, {
                backgroundColor: '#1d1d1d', // ~ card-bg color
                scale: 2,
                useCORS: true, 
            });
            setScreenshot(canvas.toDataURL('image/png'));
        } catch (error) {
            console.error("Error capturing screenshot:", error);
        } finally {
            setIsCapturing(false);
        }
    };


    return (
        <>
            <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg">
                <div className="overflow-x-auto">
                    <div ref={tableRef} className="p-4 bg-transparent">
                        <h2 className="font-orbitron text-2xl mb-1 text-white">Clasificación General</h2>
                        <p className="text-sm text-gray-400 mb-4">
                            Tras la carrera {currentRaceNumber} de {totalRaces}
                        </p>
                        <table className="w-full text-sm text-left text-gray-300">
                            <thead className="text-xs text-red-400 uppercase bg-gray-900/50">
                                <tr>
                                    <th scope="col" className="px-2 py-3 text-center">Pos</th>
                                    <th scope="col" className="px-2 py-3">Jugador</th>
                                    <th scope="col" className="px-2 py-3 text-center">Puntos</th>
                                    <th scope="col" className="px-2 py-3 text-center" title="Diferencia con el líder">Dif. 1º</th>
                                    <th scope="col" className="px-2 py-3 text-center" title="Diferencia con el siguiente">Dif. Sig.</th>
                                    <th scope="col" className="px-2 py-3 text-center">Ult. Carr.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.standings.map((player, index) => {
                                    const diffFromLeader = leaderPoints - player.totalPoints;
                                    const diffFromNext = index > 0 ? (data.standings[index - 1].totalPoints - player.totalPoints) : 0;
                                    const lastRacePoints = currentRaceNumber > 0 ? player.pointsPerRace[currentRaceNumber - 1] || 0 : 0;

                                    return (
                                        <tr key={player.player} className="border-b border-gray-700 hover:bg-gray-800/50">
                                            <td className="px-2 py-3 text-center">
                                                <span className={`w-8 h-8 inline-flex items-center justify-center font-bold rounded-full text-xs transition-colors ${getPositionClass(index)}`}>
                                                    {index + 1}
                                                </span>
                                            </td>
                                            <td className="px-2 py-4 font-orbitron font-bold text-white">{player.player}</td>
                                            <td className="px-2 py-4 text-center motogp-red font-orbitron">{player.totalPoints}</td>
                                            <td className="px-2 py-4 text-center text-gray-400">{index === 0 ? '-' : `-${diffFromLeader}`}</td>
                                            <td className="px-2 py-4 text-center text-gray-400">{index === 0 ? '-' : `-${diffFromNext}`}</td>
                                            <td className="px-2 py-4 text-center">{lastRacePoints}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                 <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleCaptureScreenshot}
                        disabled={isCapturing}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center disabled:bg-gray-500 disabled:cursor-not-allowed"
                        aria-label={isCapturing ? "Capturando..." : "Capturar y compartir clasificación"}
                    >
                        {isCapturing ? (
                            <RefreshIcon className="w-5 h-5 animate-spin mr-2" />
                        ) : (
                            <CameraIcon className="w-5 h-5 mr-2" />
                        )}
                        <span>{isCapturing ? 'Capturando...' : 'Compartir Clasificación'}</span>
                    </button>
                </div>
            </div>
             {screenshot && (
                <ScreenshotModal 
                    imageDataUrl={screenshot}
                    onClose={() => setScreenshot(null)}
                />
            )}
        </>
    );
}

function StatisticsTab({ data }: { data: MotoGpData }) {
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

    const playerColors = useMemo(() => {
        const colors = new Map<string, string>();
        data.standings.forEach((player, index) => {
            colors.set(player.player, PLAYER_CHART_COLORS[index % PLAYER_CHART_COLORS.length]);
        });
        return colors;
    }, [data.standings]);

    const togglePlayer = (playerName: string) => {
        setSelectedPlayers(prev => 
            prev.includes(playerName)
                ? prev.filter(p => p !== playerName)
                : [...prev, playerName]
        );
    };

    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg">
            <h2 className="font-orbitron text-2xl mb-4 text-white">Análisis de Evolución</h2>
            
            {/* Player Selection Buttons */}
            <div className="flex flex-wrap gap-2 mb-6 justify-center">
                {data.standings.map(player => {
                    const color = playerColors.get(player.player) || '#888';
                    const isSelected = selectedPlayers.includes(player.player);
                    return (
                        <button
                            key={player.player}
                            onClick={() => togglePlayer(player.player)}
                            className={`px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 border-2 ${
                                isSelected 
                                ? 'text-white shadow-lg' 
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-transparent'
                            }`}
                            style={isSelected ? { backgroundColor: color, borderColor: 'white' } : {}}
                        >
                            {player.player}
                        </button>
                    );
                })}
            </div>

            {/* Evolution Chart */}
            <EvolutionChart data={data} selectedPlayers={selectedPlayers} playerColors={playerColors} />

        </div>
    );
}

function CircuitsTab({ data }: { data: MotoGpData }) {
    const [selectedCircuitIndex, setSelectedCircuitIndex] = useState(0);
    
    if (!data.races || data.races.length === 0) {
        return <div className="text-center text-gray-400">No hay datos de circuitos disponibles.</div>;
    }

    const getRaceData = (raceIndex: number) => {
        return data.standings.map(player => ({
            player: player.player,
            points: player.pointsPerRace[raceIndex] || 0,
            vote: data.playerVotes.find(v => v.player === player.player)?.votesPerRace[raceIndex] || 'N/A'
        })).sort((a,b) => b.points - a.points);
    }
    
    const raceData = getRaceData(selectedCircuitIndex);

    return (
        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 card-bg p-4 sm:p-6 rounded-xl shadow-lg">
                <h2 className="font-orbitron text-2xl mb-4 text-white">Circuitos</h2>
                {/* Mobile / Tablet buttons */}
                <div className="lg:hidden flex flex-wrap gap-2">
                    {data.races.map((race, index) => (
                        <button
                            key={race.circuit}
                            onClick={() => setSelectedCircuitIndex(index)}
                            className={`flex-grow p-2 text-xs rounded-md transition-colors ${selectedCircuitIndex === index ? 'motogp-red-bg text-white' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                        >
                            {race.circuit}
                        </button>
                    ))}
                </div>
                {/* Desktop list */}
                <div className="hidden lg:flex flex-col space-y-2 max-h-[60vh] overflow-y-auto">
                    {data.races.map((race, index) => (
                         <button
                            key={race.circuit}
                            onClick={() => setSelectedCircuitIndex(index)}
                            className={`w-full text-left p-3 rounded-md transition-colors ${selectedCircuitIndex === index ? 'motogp-red-bg text-white' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                         >
                            <p className="font-bold">{race.circuit}</p>
                            <p className="text-xs">{race.date}</p>
                         </button>
                    ))}
                </div>
            </div>
            <div className="lg:col-span-2 card-bg p-4 sm:p-6 rounded-xl shadow-lg">
                <h2 className="font-orbitron text-2xl mb-4 text-white">
                    Resultados de <span className="motogp-red">{data.races[selectedCircuitIndex]?.circuit ?? 'N/A'}</span>
                </h2>
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-red-400 uppercase bg-gray-900/50">
                            <tr>
                                <th className="px-6 py-3">Jugador</th>
                                <th className="px-6 py-3 text-center">Puntos</th>
                                <th className="px-6 py-3">Voto Piloto del Día</th>
                            </tr>
                        </thead>
                        <tbody>
                            {raceData.map(res => (
                                <tr key={res.player} className="border-b border-gray-700 hover:bg-gray-800/50">
                                    <td className="px-6 py-4 font-bold text-white">{res.player}</td>
                                    <td className="px-6 py-4 text-center font-orbitron">{res.points}</td>
                                    <td className="px-6 py-4">{res.vote}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function ParticipantesTab({ data }: { data: MotoGpData }) {
    const [selectedPlayerIndex, setSelectedPlayerIndex] = useState(0);
    const players = useMemo(() => data.standings.map(p => p.player).sort((a, b) => a.localeCompare(b)), [data.standings]);
    const selectedPlayer = players[selectedPlayerIndex];

    const voteData = useMemo(() => {
        if (!selectedPlayer || !data.allDrivers) return [];

        const playerVotesMap = new Map<string, number>();
        data.driverVoteCounts.forEach(driverCount => {
            const votes = driverCount.votesByPlayer[selectedPlayer];
            if (votes) {
                playerVotesMap.set(driverCount.driver, votes);
            }
        });

        return data.allDrivers.map(driverName => ({
            driver: driverName,
            count: playerVotesMap.get(driverName) || 0,
        }));
    }, [selectedPlayer, data.allDrivers, data.driverVoteCounts]);
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 card-bg p-4 sm:p-6 rounded-xl shadow-lg">
                <h2 className="font-orbitron text-2xl mb-4 text-white">Participantes</h2>
                {/* Mobile / Tablet buttons */}
                <div className="lg:hidden flex flex-wrap gap-2">
                    {players.map((player, index) => (
                        <button
                            key={player}
                            onClick={() => setSelectedPlayerIndex(index)}
                            className={`flex-grow p-2 text-xs rounded-md transition-colors ${selectedPlayerIndex === index ? 'motogp-red-bg text-white' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                        >
                            {player}
                        </button>
                    ))}
                </div>
                 {/* Desktop list */}
                <div className="hidden lg:flex flex-col space-y-2 max-h-[60vh] overflow-y-auto">
                    {players.map((player, index) => (
                         <button
                            key={player}
                            onClick={() => setSelectedPlayerIndex(index)}
                            className={`w-full text-left p-3 rounded-md transition-colors ${selectedPlayerIndex === index ? 'motogp-red-bg text-white' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                         >
                            <p className="font-bold">{player}</p>
                         </button>
                    ))}
                </div>
            </div>
            <div className="lg:col-span-2 card-bg p-4 sm:p-6 rounded-xl shadow-lg">
                <h2 className="font-orbitron text-2xl mb-4 text-white">
                    Votos de <span className="motogp-red">{selectedPlayer}</span>
                </h2>
                 <VotesChart data={voteData} />
            </div>
        </div>
    );
}

function VotarTab() {
    const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSehFnSvXp_Wp0zEPodbrzTdBTiX7cdwQkhJZsTEimwLMVPzdw/viewform?embedded=true";
    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg">
            <h2 className="font-orbitron text-2xl mb-4 text-white">Formulario de Votación</h2>
            <p className="text-gray-400 mb-6">Completa el formulario para registrar tu voto para la próxima carrera. ¡Mucha suerte!</p>
            <div className="w-full h-[1200px] overflow-hidden rounded-lg">
                 <iframe
                    src={formUrl}
                    width="100%"
                    height="1200"
                    frameBorder="0"
                    marginHeight={0}
                    marginWidth={0}
                    title="Formulario de Votación de PorraGP"
                    >
                    Cargando…
                </iframe>
            </div>
        </div>
    );
}

function LiveTimingTab() {
    const fullscreenRef = useRef<HTMLDivElement>(null);
    const wakeLockSentinelRef = useRef<any>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [head, setHead] = useState<LiveTimingHead | null>(null);
    const liveTimingUrl = "https://script.google.com/macros/s/AKfycby2qhTo5C07UyquNIz8pmz4b4-7ZPn56DE_1gijH1Ze2irSWzsmXC9_f_seI9TXvekj/exec";

    const releaseWakeLock = useCallback(async () => {
        if (wakeLockSentinelRef.current) {
            try {
                await wakeLockSentinelRef.current.release();
                wakeLockSentinelRef.current = null;
            } catch(e) {
                console.error("Error releasing wake lock:", e);
            }
        }
    }, []);
    
    const handleFullscreenChange = useCallback(() => {
        const isCurrentlyFullscreen = !!document.fullscreenElement;
        setIsFullscreen(isCurrentlyFullscreen);
        if (!isCurrentlyFullscreen) {
            releaseWakeLock();
        }
    }, [releaseWakeLock]);

    const toggleFullscreen = useCallback(async () => {
        const element = fullscreenRef.current;
        if (!element) return;

        if (!document.fullscreenElement) {
            try {
                await element.requestFullscreen();
                if ('wakeLock' in navigator && (navigator as any).wakeLock) {
                    try {
                        wakeLockSentinelRef.current = await (navigator as any).wakeLock.request('screen');
                    } catch (err: any) {
                        console.error(`No se pudo adquirir el Wake Lock: ${err.message}`);
                    }
                }
            } catch (err: any) {
                console.error(`Error al activar pantalla completa: ${err.message}`);
            }
        } else {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            }
        }
    }, []);

    useEffect(() => {
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            releaseWakeLock();
        };
    }, [handleFullscreenChange, releaseWakeLock]);

    useEffect(() => {
        const loadHead = async () => {
            try {
                const data = await fetchLiveTiming();
                setHead(data.head);
            } catch (err) {
                console.error("Failed to load live timing head", err);
            }
        };
        loadHead();
        const interval = setInterval(loadHead, 600000); // 10 minutes
        return () => clearInterval(interval);
    }, []);

    return (
        <div ref={fullscreenRef} className="flex flex-col flex-grow bg-gray-900 data-[fullscreen=true]:p-0 data-[fullscreen=true]:h-screen data-[fullscreen=true]:w-screen data-[fullscreen=true]:rounded-none" data-fullscreen={isFullscreen}>
             <div className="flex justify-between items-center mb-4 data-[fullscreen=true]:p-4 data-[fullscreen=true]:bg-gray-900 data-[fullscreen=true]:absolute data-[fullscreen=true]:top-0 data-[fullscreen=true]:left-0 data-[fullscreen=true]:w-full data-[fullscreen=true]:z-10" data-fullscreen={isFullscreen}>
                <h2 className="font-orbitron text-2xl text-white data-[fullscreen=true]:hidden" data-fullscreen={isFullscreen}>Live Timing</h2>
                <div className="flex-grow data-[fullscreen=true]:block hidden" /> {/* Spacer */}
                <button 
                    onClick={toggleFullscreen} 
                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center"
                    aria-label={isFullscreen ? "Salir de pantalla completa" : "Poner en pantalla completa"}
                >
                    {isFullscreen ? (
                        <>
                            <FullscreenExitIcon className="w-5 h-5 mr-2" />
                            Salir
                        </>
                    ) : (
                        <>
                            <FullscreenIcon className="w-5 h-5 mr-2" />
                            Pantalla Completa
                        </>
                    )}
                </button>
            </div>

            {/* Info Header from API - Hidden in fullscreen to maximize iframe space */}
            {head && (
                <div className="mb-4 bg-gray-800/50 p-4 rounded-lg border border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4 data-[fullscreen=true]:hidden" data-fullscreen={isFullscreen}>
                    <div className="flex items-center gap-3">
                        <div className={`px-3 py-1 rounded font-bold font-orbitron text-sm ${head.session_status_name === 'LIVE' ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-600 text-gray-300'}`}>
                            {head.session_status_name || 'OFFLINE'}
                        </div>
                        <div className="text-center sm:text-left">
                            <h3 className="text-white font-bold text-lg">{head.circuit_name}</h3>
                            <p className="text-gray-400 text-sm">{head.category} - {head.session_name}</p>
                        </div>
                    </div>
                </div>
            )}

            <iframe
                src={liveTimingUrl}
                className="w-full flex-grow border-0 data-[fullscreen=true]:pt-16"
                data-fullscreen={isFullscreen}
                title="Live Timing Script"
                allowFullScreen
            >
                Cargando Live Timing...
            </iframe>
        </div>
    );
}

function NewsTab() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(0);

    const RSS_URL = 'https://es.motorsport.com/rss/motogp/news/';
    // Usamos un proxy CORS diferente y más fiable para evitar errores de fetch.
    const PROXY_URL = 'https://corsproxy.io/?';

    useEffect(() => {
        const fetchNews = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // La URL del feed debe estar codificada para que el proxy la maneje correctamente.
                const response = await fetch(`${PROXY_URL}${encodeURIComponent(RSS_URL)}`);
                if (!response.ok) {
                    throw new Error(`Error al obtener el feed de noticias (código ${response.status})`);
                }
                const text = await response.text();
                
                const parser = new DOMParser();
                const xml = parser.parseFromString(text, 'application/xml');
                const errorNode = xml.querySelector('parsererror');
                if (errorNode) {
                    throw new Error('Error al analizar el feed RSS.');
                }

                const items = Array.from(xml.querySelectorAll('item'));
                
                const parsedArticles: Article[] = items.map(item => {
                    const title = item.querySelector('title')?.textContent?.trim() || 'Sin título';
                    const link = item.querySelector('link')?.textContent || '#';
                    let description = item.querySelector('description')?.textContent?.trim() || '';
                    
                    description = description.split('<a class=\'more\'')[0].trim();
                    description = description.replace(/<br\s*\/?>/gi, ' ').replace(/Recuerda:/gi, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();

                    const imageUrl = item.querySelector('enclosure')?.getAttribute('url') || '';
                    const pubDateStr = item.querySelector('pubDate')?.textContent || '';
                    const pubDate = pubDateStr ? new Date(pubDateStr).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

                    return { title, link, description, imageUrl, pubDate };
                });
                setArticles(parsedArticles);

            } catch (err: any) {
                setError(err.message || 'Ocurrió un error al cargar las noticias.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchNews();
    }, []);

    const ARTICLES_PER_PAGE = 6;
    const indexOfLastArticle = (currentPage + 1) * ARTICLES_PER_PAGE;
    const indexOfFirstArticle = indexOfLastArticle - ARTICLES_PER_PAGE;
    const currentArticles = articles.slice(indexOfFirstArticle, indexOfLastArticle);
    const totalPages = Math.ceil(articles.length / ARTICLES_PER_PAGE);


    if (isLoading) {
        return (
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-red-500 mx-auto"></div>
                <p className="mt-4 text-lg text-gray-300">Cargando noticias...</p>
            </div>
        );
    }

    if (error) {
        return <p className="text-center text-red-400">{error}</p>;
    }

    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg">
            <div className="flex items-center mb-6">
                <h2 className="font-orbitron text-3xl text-white">Últimas Noticias</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {currentArticles.map((article, index) => (
                    <a 
                        key={index} 
                        href={article.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="card-bg rounded-lg shadow-md overflow-hidden group transform hover:-translate-y-2 transition-transform duration-300 flex flex-col"
                    >
                        <div className="w-full h-48 overflow-hidden">
                             <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                        </div>
                        <div className="p-4 flex flex-col flex-grow">
                            <p className="text-xs text-gray-400 mb-2">{article.pubDate}</p>
                            <h3 className="font-bold text-md text-white group-hover:motogp-red transition-colors flex-grow">{article.title}</h3>
                            <p className="text-sm text-gray-300 mt-2">{article.description}</p>
                        </div>
                    </a>
                ))}
            </div>
            
            <div className="mt-8 flex justify-center items-center gap-4">
                {currentPage > 0 && (
                    <button
                        onClick={() => setCurrentPage(prev => prev - 1)}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                    >
                        Anterior
                    </button>
                )}
                 {totalPages > 1 && (
                    <span className="text-gray-400">
                        Página {currentPage + 1} de {totalPages}
                    </span>
                 )}
                {currentPage < totalPages - 1 && (
                    <button
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        className="motogp-red-bg text-white font-bold py-2 px-6 rounded-lg transition-colors hover:bg-red-700"
                    >
                        Siguiente
                    </button>
                )}
            </div>

        </div>
    );
}

// Helper component for detailed stat cards
const StatDetailCard = ({ title, total, categories, borderColor }: { title: string, total: number, categories: any[], borderColor: string }) => (
    <div className={`bg-gray-800/80 p-4 rounded-xl border-t-4 shadow-lg backdrop-blur-sm flex flex-col h-full ${borderColor}`}>
        <div className="text-center mb-3">
            <p className="text-4xl font-bold text-white font-orbitron">{total}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-bold">{title}</p>
        </div>
        {categories && categories.length > 0 && (
             <div className="mt-auto pt-3 border-t border-gray-700 space-y-1">
                {categories.map((cat: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">{cat.category.name}</span>
                        <span className="text-white font-bold">{cat.count}</span>
                    </div>
                ))}
            </div>
        )}
    </div>
);

// Helper to render the "Current Season" chart (mocked visual structure)
const CurrentSeasonChart = () => {
    // Mock points for visualization to match the style
    const points = [5, 10, 0, 13, 0, 25, 20, 0, 0, 2, 0, 0, 0, 0, 7, 0, 0, 9, 3];
    const sprintPoints = [0, 6, 0, 2, 0, 4, 5, 0, 0, 0, 3, 2, 1, 3, 0, 0, 0, 3, 0];
    
    return (
        <div className="w-full h-48 relative mt-4">
            <div className="absolute inset-0 flex flex-col justify-between text-xs text-gray-600">
                <span>25</span>
                <span>20</span>
                <span>15</span>
                <span>10</span>
                <span>5</span>
                <span>0</span>
            </div>
            <div className="absolute inset-0 left-6 right-0 border-l border-b border-gray-700">
                {/* Mocked chart lines using SVG */}
                <svg className="w-full h-full" preserveAspectRatio="none">
                     <polyline 
                        points={points.map((p, i) => `${(i / (points.length - 1)) * 100}%,${100 - (p / 25) * 100}%`).join(' ')}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="2"
                    />
                     <polyline 
                        points={sprintPoints.map((p, i) => `${(i / (sprintPoints.length - 1)) * 100}%,${100 - (p / 25) * 100}%`).join(' ')}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2"
                    />
                    {points.map((p, i) => (
                         <circle key={`r-${i}`} cx={`${(i / (points.length - 1)) * 100}%`} cy={`${100 - (p / 25) * 100}%`} r="2" fill="#ef4444" />
                    ))}
                     {sprintPoints.map((p, i) => (
                         <circle key={`s-${i}`} cx={`${(i / (sprintPoints.length - 1)) * 100}%`} cy={`${100 - (p / 25) * 100}%`} r="2" fill="#22c55e" />
                    ))}
                </svg>
            </div>
            <div className="absolute bottom-0 left-6 right-0 flex justify-between text-[9px] text-gray-500 translate-y-4">
                {['QAT', 'POR', 'AME', 'SPA', 'FRA', 'CAT', 'ITA', 'GER', 'NED', 'GBR', 'AUT', 'ARA', 'RSM', 'EMI', 'INA', 'JPN', 'AUS', 'THA', 'MAL'].map((track, i) => (
                     <span key={i} className="hidden sm:inline-block transform -rotate-45 origin-top-left">{track}</span>
                ))}
            </div>
             <div className="absolute top-0 right-0 flex gap-4 text-[10px]">
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full"></div> <span className="text-gray-400">RACE</span></div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full"></div> <span className="text-gray-400">SPR</span></div>
            </div>
        </div>
    );
};

function RiderProfileView({ riderId, onBack }: { riderId: string; onBack: () => void }) {
    const [rider, setRider] = useState<ApiRider | null>(null);
    const [stats, setStats] = useState<RiderStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadRiderData = async () => {
            setLoading(true);
            try {
                const details = await fetchRiderDetails(riderId);
                setRider(details);

                if (details.legacy_id) {
                    try {
                        const statsData = await fetchRiderStats(details.legacy_id);
                        setStats(statsData);
                    } catch (e) {
                        console.warn("No se pudieron cargar las estadísticas extendidas", e);
                    }
                }
            } catch (error) {
                console.error("Error cargando detalles del piloto:", error);
            } finally {
                setLoading(false);
            }
        };
        loadRiderData();
    }, [riderId]);

    // Determine the best source of truth for current season data.
    const riderData = useMemo(() => {
        if (!rider) return null;
        
        // Prefer the entry in 'career' that is marked current or is the latest season
        let careerStep = rider.career?.find(c => c.current);
        
        if (!careerStep && rider.career?.length) {
             // If no current flag, take the latest season
             const maxSeason = Math.max(...rider.career.map(c => c.season));
             careerStep = rider.career.find(c => c.season === maxSeason);
        }

        const base = careerStep || rider.current_career_step;
        const fallback = rider.current_career_step;

        return {
            picture: base?.pictures?.portrait || base?.pictures?.profile?.main || fallback?.pictures?.portrait || fallback?.pictures?.profile?.main,
            bikePicture: base?.pictures?.bike?.main || fallback?.pictures?.bike?.main,
            teamName: base?.team?.name || fallback?.team?.name || 'Sin Equipo',
            riderNumber: base?.number || fallback?.number,
            constructorName: base?.team?.constructor?.name || fallback?.team?.constructor?.name || '-',
            categoryName: base?.category?.name || fallback?.category?.name || '-',
            teamColor: base?.team?.color || fallback?.team?.color || '#374151',
        };
    }, [rider]);

    if (!rider && loading) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
             <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-red-500 mx-auto"></div>
             <p className="mt-4 text-gray-400 font-orbitron">Cargando perfil...</p>
        </div>
    );

    if (!rider || !riderData) return (
        <div className="text-center py-20">
            <p className="text-gray-400 mb-4">No se encontró información del piloto.</p>
            <button onClick={onBack} className="text-red-500 hover:underline">Volver</button>
        </div>
    );

    const { picture, bikePicture, teamName, riderNumber, constructorName, categoryName } = riderData;

    return (
        <div className="bg-[#121212] text-white min-h-screen p-4 lg:p-8 font-sans animate-fade-in">
            {/* Botón Volver */}
            <button 
                onClick={onBack} 
                className="mb-6 bg-[#1a1a1a] hover:bg-[#252525] text-white font-bold py-2 px-4 rounded flex items-center border border-gray-700 transition-colors text-sm"
            >
                ← Volver a la lista
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Columna Izquierda: Foto Grande */}
                <div className="lg:col-span-1 relative h-[500px] lg:h-auto bg-[#1a1a1a] rounded-lg overflow-hidden border border-gray-800 flex items-end justify-center shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent z-10"></div>
                     {picture ? (
                        <img src={picture} alt={rider.name} className="h-full w-full object-cover object-top relative z-0" />
                    ) : (
                        <UserIcon className="w-48 h-48 text-gray-700 mb-20" />
                    )}
                    <h1 className="absolute bottom-8 left-0 right-0 text-center text-3xl font-orbitron font-bold z-20 tracking-wider uppercase text-white drop-shadow-lg">
                        {rider.name} {rider.surname}
                    </h1>
                </div>

                {/* Columna Derecha: Detalles */}
                <div className="lg:col-span-2 flex flex-col gap-8">
                    
                    {/* Header: Nombre y Equipo */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-800 pb-6">
                        <div className="flex items-center gap-4">
                             {rider.country.flag && <img src={rider.country.flag} alt={rider.country.iso} className="h-8 rounded shadow-sm" />}
                             <div>
                                <h2 className="text-4xl sm:text-5xl font-orbitron font-bold uppercase tracking-wide leading-none">
                                    {rider.name} <span className="text-red-600">{rider.surname}</span>
                                </h2>
                                <p className="text-gray-400 text-lg mt-1">{teamName}</p>
                             </div>
                        </div>
                        {riderNumber && (
                            <div className="text-6xl sm:text-7xl font-black text-[#1a1a1a] font-orbitron mt-4 sm:mt-0" style={{ WebkitTextStroke: '1px #333' }}>
                                #{riderNumber}
                            </div>
                        )}
                    </div>

                    {/* Estadísticas Clave */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatDetailCard title="Victorias" total={stats?.grand_prix_victories.total || 0} categories={stats?.grand_prix_victories.categories || []} borderColor="border-red-600" />
                        <StatDetailCard title="Podios" total={stats?.podiums.total || 0} categories={stats?.podiums.categories || []} borderColor="border-gray-400" />
                        <StatDetailCard title="Poles" total={stats?.poles.total || 0} categories={stats?.poles.categories || []} borderColor="border-blue-500" />
                        <StatDetailCard title="Títulos" total={stats?.world_championship_wins.total || 0} categories={stats?.world_championship_wins.categories || []} borderColor="border-yellow-500" />
                    </div>

                    {/* Botones de Acción */}
                    <div className="flex gap-4">
                        <button className="flex-1 bg-[#1e293b] hover:bg-[#334155] text-white py-3 rounded font-bold uppercase tracking-wider text-sm border border-gray-600 transition-colors">
                            Más estadísticas
                        </button>
                        <button className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded font-bold uppercase tracking-wider text-sm transition-colors shadow-lg shadow-red-900/20">
                            Histórico posición
                        </button>
                    </div>

                    {/* Gráfica Temporada Actual */}
                    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-6">
                        <h3 className="font-orbitron text-lg uppercase tracking-widest mb-4 text-white">Temporada Actual</h3>
                        <CurrentSeasonChart />
                    </div>

                    {/* Grid Inferior: Datos y Máquina */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Datos Personales */}
                        <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-6">
                             <h3 className="font-orbitron text-lg uppercase tracking-widest mb-6 text-red-500">Datos Personales</h3>
                             <div className="space-y-4 text-sm">
                                <div className="flex justify-between border-b border-gray-800 pb-2">
                                    <span className="text-gray-500">Nacionalidad</span>
                                    <span className="font-bold text-white">{rider.country.name}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-800 pb-2">
                                    <span className="text-gray-500">Ciudad Natal</span>
                                    <span className="font-bold text-white">{rider.birth_city}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-800 pb-2">
                                    <span className="text-gray-500">Fecha de Nacimiento</span>
                                    <span className="font-bold text-white">{new Date(rider.birth_date).toLocaleDateString()}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-800 pb-2">
                                    <span className="text-gray-500">Edad</span>
                                    <span className="font-bold text-white">{rider.years_old} años</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-800 pb-2">
                                    <span className="text-gray-500">Altura</span>
                                    <span className="font-bold text-white">{rider.physical_attributes?.height || '-'} cm</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-800 pb-2">
                                    <span className="text-gray-500">Peso</span>
                                    <span className="font-bold text-white">{rider.physical_attributes?.weight || '-'} kg</span>
                                </div>
                             </div>
                        </div>

                        {/* Equipo & Máquina */}
                        <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-6 relative overflow-hidden">
                            <h3 className="font-orbitron text-lg uppercase tracking-widest mb-6 text-red-500">Equipo & Máquina</h3>
                            <div className="space-y-4 text-sm relative z-10">
                                <div className="flex justify-between border-b border-gray-800 pb-2">
                                    <span className="text-gray-500">Dorsal</span>
                                    <span className="font-bold text-white">#{riderNumber}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-800 pb-2">
                                    <span className="text-gray-500">Equipo</span>
                                    <span className="font-bold text-white text-right">{teamName}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-800 pb-2">
                                    <span className="text-gray-500">Constructor</span>
                                    <span className="font-bold text-white">{constructorName}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-800 pb-2">
                                    <span className="text-gray-500">Categoría</span>
                                    <span className="font-bold text-white">{categoryName}</span>
                                </div>
                            </div>
                            {/* Foto de la moto superpuesta en la parte inferior */}
                            <div className="mt-4 flex justify-center">
                                {bikePicture ? (
                                    <img src={bikePicture} alt="Bike" className="max-h-48 object-contain drop-shadow-2xl transform hover:scale-105 transition-transform duration-500" />
                                ) : (
                                    <div className="h-32 w-full flex items-center justify-center bg-gray-800/30 rounded text-gray-600 italic">
                                        Imagen de moto no disponible
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

function MotoGpRidersView({ onRiderSelect, onBack }: { onRiderSelect: (riderId: string) => void, onBack: () => void }) {
    const [riders, setRiders] = useState<ApiRider[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('MotoGP');

    useEffect(() => {
        const loadRiders = async () => {
            setLoading(true);
            try {
                const allRiders = await fetchAllRiders();
                setRiders(allRiders);
            } catch (error) {
                console.error("Error cargando pilotos:", error);
            } finally {
                setLoading(false);
            }
        };
        loadRiders();
    }, []);

    const filteredRiders = useMemo(() => {
        // 1. Filtrar por categoría de manera segura (usando optional chaining)
        let filtered = riders.filter(r => 
            r.current_career_step?.category?.name?.toLowerCase().includes(selectedCategory.toLowerCase()) ?? false
        );

        // 2. Ordenar: Oficiales primero, luego por número de dorsal
        filtered.sort((a, b) => {
            const typeA = a.current_career_step?.type;
            const typeB = b.current_career_step?.type;
            const numA = a.current_career_step?.number || 999;
            const numB = b.current_career_step?.number || 999;

            const isOfficialA = typeA === 'Official';
            const isOfficialB = typeB === 'Official';

            // Si uno es oficial y el otro no, el oficial va primero
            if (isOfficialA && !isOfficialB) return -1;
            if (!isOfficialA && isOfficialB) return 1;

            // Si ambos son del mismo tipo (ambos oficiales o ambos no oficiales), ordenar por número
            return numA - numB;
        });

        return filtered;
    }, [riders, selectedCategory]);

    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg animate-fade-in">
             <button onClick={onBack} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center mb-6">
                &larr; Volver al menú
            </button>

            <div className="flex justify-center gap-4 mb-8">
                {['MotoGP', 'Moto2', 'Moto3'].map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-6 py-2 rounded-full font-bold transition-all transform hover:scale-105 ${
                            selectedCategory === cat
                            ? 'motogp-red-bg text-white shadow-lg'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {loading ? (
                 <div className="text-center py-12">
                     <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-red-500 mx-auto"></div>
                     <p className="mt-4 text-gray-400">Cargando parrilla...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredRiders.map(rider => {
                        // Check if career step exists to avoid crashes
                        const career = rider.current_career_step;
                        if (!career) return null;

                        const isSubstitute = career.type !== 'Official';
                        const teamColor = career.team?.color || '#374151';
                        
                        return (
                            <div 
                                key={rider.id}
                                onClick={() => onRiderSelect(rider.id)}
                                className="relative bg-gray-800/40 border border-gray-700 rounded-xl overflow-hidden hover:border-red-500 transition-all duration-300 cursor-pointer group hover:-translate-y-1"
                            >
                                {isSubstitute && (
                                    <div className="absolute top-2 right-2 z-10 bg-yellow-600 text-white text-xs font-bold px-2 py-1 rounded">
                                        {career.type}
                                    </div>
                                )}
                                
                                <div 
                                    className="h-44 w-full relative overflow-hidden"
                                    style={{ background: `linear-gradient(to top right, #000000, ${teamColor})` }}
                                >
                                     {/* Imagen del piloto */}
                                     {career.pictures?.profile?.main ? (
                                         <img 
                                            src={career.pictures.profile.main} 
                                            alt={rider.name} 
                                            className="w-full h-full object-cover object-top transform group-hover:scale-105 transition-transform duration-300"
                                        />
                                     ) : (
                                         <div className="w-full h-full flex items-center justify-center">
                                            <UserIcon className="w-24 h-24 text-gray-600" />
                                         </div>
                                     )}
                                     
                                     {/* Dorsal superpuesto */}
                                     {career.number && (
                                         <span className="absolute bottom-2 left-2 text-5xl font-bold font-orbitron text-white/10 group-hover:text-white/20 transition-colors">
                                             {career.number}
                                         </span>
                                     )}
                                </div>

                                <div className="p-2">
                                    <div className="flex justify-between items-center">
                                        <div className="min-w-0 pr-2">
                                            <h3 className="text-base font-bold text-white leading-tight truncate">{rider.name} {rider.surname}</h3>
                                            <p className="text-gray-400 text-xs truncate">{career.team?.name}</p>
                                        </div>
                                        <div className="flex flex-col items-center flex-shrink-0">
                                            {rider.country.flag && (
                                                <img src={rider.country.flag} alt={rider.country.iso} className="w-5 rounded shadow-sm" />
                                            )}
                                            <span className="text-[9px] text-gray-500">{rider.country.iso}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// --- MOTO GP DATA COMPONENTS ---

type MotoGpDataView = 'menu' | 'results' | 'riders' | 'profile' | 'circuits';

function MotoGpDataMenu({ onSelectView }: { onSelectView: (view: MotoGpDataView) => void }) {
    return (
        <div className="animate-fade-in">
            <h2 className="font-orbitron text-3xl text-white text-center mb-8">MotoGP Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <button 
                    onClick={() => onSelectView('results')}
                    className="card-bg p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-4 border-t-4 border-red-600 hover:bg-gray-800/60 transition-all duration-300 transform hover:-translate-y-1 text-left w-full"
                >
                    <div className="p-3 bg-gray-700/50 rounded-lg text-red-500">
                        <TableIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-400">Consulta los</p>
                        <h2 className="text-lg sm:text-2xl font-bold text-white font-orbitron">Resultados</h2>
                        <p className="text-xs sm:text-sm text-green-500">Oficiales de cada sesión</p>
                    </div>
                </button>

                <button 
                    onClick={() => onSelectView('riders')}
                    className="card-bg p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-4 border-t-4 border-red-600 hover:bg-gray-800/60 transition-all duration-300 transform hover:-translate-y-1 text-left w-full"
                >
                    <div className="p-3 bg-gray-700/50 rounded-lg text-red-500">
                        <UserIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-400">Información de</p>
                        <h2 className="text-lg sm:text-2xl font-bold text-white font-orbitron">Pilotos</h2>
                        <p className="text-xs sm:text-sm text-green-500">Parrilla y Fichas</p>
                    </div>
                </button>

                <button 
                    onClick={() => onSelectView('circuits')}
                    className="card-bg p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-4 border-t-4 border-red-600 hover:bg-gray-800/60 transition-all duration-300 transform hover:-translate-y-1 text-left w-full"
                >
                    <div className="p-3 bg-gray-700/50 rounded-lg text-red-500">
                        <FlagIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-400">Detalles de</p>
                        <h2 className="text-lg sm:text-2xl font-bold text-white font-orbitron">Circuitos</h2>
                        <p className="text-xs sm:text-sm text-green-500">Calendario y Eventos</p>
                    </div>
                </button>
            </div>
        </div>
    );
}

function MotoGpResultsView({ onBack }: { onBack: () => void }) {
    const [seasons, setSeasons] = useState<ApiSeason[]>([]);
    const [categories, setCategories] = useState<ApiCategoryResult[]>([]);
    const [events, setEvents] = useState<ApiEventResult[]>([]);
    const [sessions, setSessions] = useState<ApiSessionResult[]>([]);
    const [classification, setClassification] = useState<ApiClassificationItem[]>([]);

    const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [selectedEventId, setSelectedEventId] = useState<string>('');
    const [selectedSessionId, setSelectedSessionId] = useState<string>('');

    const [loadingSeasons, setLoadingSeasons] = useState(true);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [loadingClassification, setLoadingClassification] = useState(false);

    // 1. Cargar Temporadas
    useEffect(() => {
        const loadSeasons = async () => {
            setLoadingSeasons(true);
            try {
                const data = await fetchSeasons();
                setSeasons(data);
                const current = data.find(s => s.current);
                if (current) {
                    setSelectedSeasonId(current.id);
                } else if (data.length > 0) {
                    setSelectedSeasonId(data[0].id);
                }
            } catch (error) {
                console.error("Error cargando temporadas:", error);
            } finally {
                setLoadingSeasons(false);
            }
        };
        loadSeasons();
    }, []);

    // 2. Cargar Categorías y Eventos cuando cambia la Temporada
    useEffect(() => {
        if (!selectedSeasonId) return;

        const loadCascadingData = async () => {
            setLoadingCategories(true);
            setLoadingEvents(true);
            try {
                // Cargar categorías
                const cats = await fetchResultCategories(selectedSeasonId);
                setCategories(cats);
                if (cats.length > 0) {
                    setSelectedCategoryId(cats[0].id);
                }

                // Cargar eventos
                const evts = await fetchResultEvents(selectedSeasonId);
                
                // Filtrar TESTs
                const filteredEvents = evts.filter(e => {
                    const name = (e.name || '').toUpperCase();
                    const sponsored = (e.sponsored_name || '').toUpperCase();
                    return !name.includes('TEST') && !sponsored.includes('TEST');
                });

                setEvents(filteredEvents);
                
                // Lógica por defecto para eventos: Último con status 'FINISHED'
                const finishedEvents = filteredEvents.filter(e => e.status === 'FINISHED');
                if (finishedEvents.length > 0) {
                    setSelectedEventId(finishedEvents[finishedEvents.length - 1].id);
                } else if (filteredEvents.length > 0) {
                    // Si no hay ninguno finished, seleccionamos el primero (o el último, según preferencia, aquí el primero del listado total)
                    setSelectedEventId(filteredEvents[0].id);
                }

            } catch (error) {
                console.error("Error cargando datos en cascada:", error);
            } finally {
                setLoadingCategories(false);
                setLoadingEvents(false);
            }
        };

        loadCascadingData();
    }, [selectedSeasonId]);

    // 3. Cargar Sesiones cuando cambia Evento o Categoría
    useEffect(() => {
        if (!selectedEventId || !selectedCategoryId) return;

        const loadSessions = async () => {
            setLoadingSessions(true);
            setSessions([]);
            setClassification([]);
            setSelectedSessionId('');
            try {
                const sessionData = await fetchResultSessions(selectedEventId, selectedCategoryId);
                setSessions(sessionData);

                // Auto-seleccionar carrera ('RAC') por defecto
                const raceSession = sessionData.find(s => s.type === 'RAC');
                if (raceSession) {
                    setSelectedSessionId(raceSession.id);
                } else if (sessionData.length > 0) {
                    // Si no hay carrera (ej: es viernes), seleccionamos la última sesión disponible (la más reciente)
                    setSelectedSessionId(sessionData[sessionData.length - 1].id);
                }
            } catch (error) {
                console.error("Error cargando sesiones:", error);
            } finally {
                setLoadingSessions(false);
            }
        };
        loadSessions();
    }, [selectedEventId, selectedCategoryId]);

    // 4. Cargar Clasificación cuando cambia la Sesión
    useEffect(() => {
        if (!selectedSessionId) return;

        const loadClassification = async () => {
            setLoadingClassification(true);
            setClassification([]);
            try {
                const data = await fetchSessionClassification(selectedSessionId);
                setClassification(data.classification);
            } catch (error) {
                console.error("Error cargando clasificación:", error);
            } finally {
                setLoadingClassification(false);
            }
        };
        loadClassification();
    }, [selectedSessionId]);


    const getSessionLabel = (session: ApiSessionResult) => {
        return session.type + (session.number ? session.number : '');
    };

    // Función auxiliar para determinar el tipo de sesión y columnas
    const isRaceSession = useMemo(() => {
        const session = sessions.find(s => s.id === selectedSessionId);
        return session?.type === 'RAC' || session?.type === 'SPR';
    }, [sessions, selectedSessionId]);

    // Obtener la sesión seleccionada para mostrar datos de cabecera
    const selectedSession = useMemo(() => sessions.find(s => s.id === selectedSessionId), [sessions, selectedSessionId]);

    // Función para formatear la fecha DD/MM/AA - HH:MM:SS
    const formatDate = (dateString: string) => {
        try {
            const date = new Date(dateString);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear().toString().slice(-2);
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const seconds = date.getSeconds().toString().padStart(2, '0');
            return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds}`;
        } catch (e) {
            return dateString;
        }
    };

    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg animate-fade-in">
            <button onClick={onBack} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center mb-6">
                &larr; Volver al menú
            </button>

            <h2 className="font-orbitron text-2xl text-white mb-6">Resultados Oficiales</h2>

            {/* FILTROS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {/* Selector de Año */}
                <div>
                    <label className="block text-gray-400 text-sm font-bold mb-2">Año</label>
                    <select
                        value={selectedSeasonId}
                        onChange={(e) => setSelectedSeasonId(e.target.value)}
                        disabled={loadingSeasons}
                        className="w-full bg-gray-800 border border-gray-600 text-white py-3 px-4 pr-8 rounded leading-tight focus:outline-none focus:border-red-500"
                    >
                        {loadingSeasons ? (
                            <option>Cargando...</option>
                        ) : (
                            seasons.map(s => (
                                <option key={s.id} value={s.id}>{s.year}</option>
                            ))
                        )}
                    </select>
                </div>

                {/* Selector de Categoría */}
                <div>
                    <label className="block text-gray-400 text-sm font-bold mb-2">Categoría</label>
                    <select
                        value={selectedCategoryId}
                        onChange={(e) => setSelectedCategoryId(e.target.value)}
                        disabled={loadingCategories || !selectedSeasonId}
                        className="w-full bg-gray-800 border border-gray-600 text-white py-3 px-4 pr-8 rounded leading-tight focus:outline-none focus:border-red-500"
                    >
                         {loadingCategories ? (
                            <option>Cargando...</option>
                        ) : (
                            categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))
                        )}
                    </select>
                </div>

                {/* Selector de Evento */}
                <div>
                    <label className="block text-gray-400 text-sm font-bold mb-2">Circuito / Evento</label>
                    <select
                         value={selectedEventId}
                         onChange={(e) => setSelectedEventId(e.target.value)}
                         disabled={loadingEvents || !selectedSeasonId}
                         className="w-full bg-gray-800 border border-gray-600 text-white py-3 px-4 pr-8 rounded leading-tight focus:outline-none focus:border-red-500"
                    >
                        {loadingEvents ? (
                            <option>Cargando...</option>
                        ) : (
                            events.map(e => (
                                <option key={e.id} value={e.id}>{e.sponsored_name || e.name}</option>
                            ))
                        )}
                    </select>
                </div>
            </div>

            {/* SELECTOR DE SESIONES */}
            {loadingSessions ? (
                <div className="text-center py-4 text-gray-400">Cargando sesiones...</div>
            ) : sessions.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-8 justify-center md:justify-start">
                    {sessions.map(s => {
                        const label = getSessionLabel(s);
                        const isSelected = selectedSessionId === s.id;
                        return (
                            <button
                                key={s.id}
                                onClick={() => setSelectedSessionId(s.id)}
                                className={`px-4 py-2 rounded text-sm font-bold transition-all duration-200 ${
                                    isSelected 
                                    ? 'motogp-red-bg text-white shadow-lg scale-105' 
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-4 text-gray-400 bg-gray-800/50 rounded-lg border border-gray-700 mb-8">
                    No hay sesiones disponibles para este evento.
                </div>
            )}

             {/* CABECERA DE SESIÓN (FECHA Y CONDICIONES) */}
             {selectedSession && (
                <div className="mb-4 bg-gray-800/50 p-3 rounded-lg border border-gray-700 text-center">
                    <p className="text-white font-orbitron text-lg font-bold mb-1">
                        {formatDate(selectedSession.date)}
                    </p>
                    {selectedSession.condition && (
                        <p className="text-xs text-gray-400 uppercase tracking-wide">
                            Pista: <span className="text-gray-300 font-bold">{selectedSession.condition.track}</span> | 
                            Tª Aire: <span className="text-gray-300 font-bold">{selectedSession.condition.air}</span> | 
                            Humedad: <span className="text-gray-300 font-bold">{selectedSession.condition.humidity}</span> | 
                            Tº Asfalto: <span className="text-gray-300 font-bold">{selectedSession.condition.ground}</span> | 
                            Clima: <span className="text-gray-300 font-bold">{selectedSession.condition.weather}</span>
                        </p>
                    )}
                </div>
            )}

            {/* TABLA DE CLASIFICACIÓN */}
            {selectedSessionId && (
                loadingClassification ? (
                    <div className="text-center py-12">
                         <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-red-500 mx-auto"></div>
                         <p className="mt-4 text-gray-400">Cargando resultados...</p>
                    </div>
                ) : classification.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-gray-700">
                        <table className="w-full text-sm text-left text-gray-300">
                            <thead className="text-xs text-red-400 uppercase bg-gray-900/90">
                                <tr>
                                    <th className="px-4 py-3 text-center">Pos</th>
                                    <th className="px-4 py-3">Piloto</th>
                                    <th className="px-4 py-3 hidden sm:table-cell">Equipo</th>
                                    <th className="px-4 py-3 hidden md:table-cell">Moto</th>
                                    {isRaceSession ? (
                                        <>
                                            <th className="px-4 py-3 text-right">Tiempo/Dif</th>
                                            <th className="px-4 py-3 text-center">Pts</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="px-4 py-3 text-right">Tiempo</th>
                                            <th className="px-4 py-3 text-right hidden sm:table-cell">Dif 1º</th>
                                            <th className="px-4 py-3 text-right hidden md:table-cell">Dif Ant</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="bg-gray-800/30">
                                {classification.map((item, index) => {
                                    const posClass = item.position === 1 ? 'bg-yellow-500 text-black' : 
                                                     item.position === 2 ? 'bg-gray-300 text-black' : 
                                                     item.position === 3 ? 'bg-yellow-700 text-white' : 'bg-gray-700 text-gray-300';

                                    // Lógica para construir la información de Equipo / Constructor de forma segura
                                    const teamName = item.team?.name;
                                    const constructorName = item.constructor?.name;
                                    
                                    let teamInfo = '';
                                    if (teamName && constructorName) {
                                        teamInfo = `${teamName} / ${constructorName}`;
                                    } else if (teamName) {
                                        teamInfo = teamName;
                                    } else if (constructorName) {
                                        teamInfo = constructorName;
                                    } else {
                                        teamInfo = '';
                                    }
                                    
                                    return (
                                        <tr key={item.id} className="border-b border-gray-700 hover:bg-gray-700/40 transition-colors">
                                            <td className="px-4 py-3 text-center">
                                                {item.position ? (
                                                    <span className={`w-6 h-6 inline-flex items-center justify-center font-bold rounded text-xs ${posClass}`}>
                                                        {item.position}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col items-center min-w-[24px]">
                                                         <span className="text-xs text-gray-400 font-mono">{item.rider.number ? `#${item.rider.number}` : ''}</span>
                                                         {/* Bandera simplificada con texto si no hay imagen disponible */}
                                                         <span className="text-[10px] text-gray-500">{item.rider.country.iso}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-white text-base">{item.rider.full_name}</span>
                                                        {/* Nuevo subtexto Team/Constructor */}
                                                        <span className="text-xs text-gray-400">{teamInfo}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 hidden sm:table-cell text-gray-400">{item.team?.name || '-'}</td>
                                            <td className="px-4 py-3 hidden md:table-cell text-gray-400">{item.constructor?.name || '-'}</td>
                                            
                                            {isRaceSession ? (
                                                <>
                                                    <td className="px-4 py-3 text-right font-mono text-white">
                                                        {index === 0 ? item.time : item.gap?.first ? `+${item.gap.first}` : item.status}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-bold text-white">
                                                        {item.points || 0}
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-4 py-3 text-right font-mono text-white font-bold">
                                                        {item.best_lap?.time}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-gray-400 hidden sm:table-cell">
                                                        {item.gap?.first === '0.000' ? '-' : (item.gap?.first ? `+${item.gap.first}` : '')}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-gray-400 hidden md:table-cell">
                                                        {item.gap?.prev === '0.000' ? '-' : (item.gap?.prev ? `+${item.gap.prev}` : '')}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-8 bg-gray-800/30 rounded-lg border border-gray-700 border-dashed">
                        <p className="text-gray-400">No hay datos de clasificación disponibles para esta sesión.</p>
                    </div>
                )
            )}
        </div>
    );
}

function MotoGpDataTab({ data }: { data: MotoGpData | null }) {
    const [currentView, setCurrentView] = useState<MotoGpDataView>('menu');
    const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);

    const handleRiderSelect = (riderId: string) => {
        setSelectedRiderId(riderId);
        setCurrentView('profile');
    };

    const renderContent = () => {
        switch (currentView) {
            case 'menu':
                return <MotoGpDataMenu onSelectView={setCurrentView} />;
            case 'results':
                return <MotoGpResultsView onBack={() => setCurrentView('menu')} />;
            case 'riders':
                return <MotoGpRidersView onRiderSelect={handleRiderSelect} onBack={() => setCurrentView('menu')} />;
            case 'profile':
                return selectedRiderId ? (
                    <RiderProfileView riderId={selectedRiderId} onBack={() => setCurrentView('riders')} />
                ) : (
                    <MotoGpRidersView onRiderSelect={handleRiderSelect} onBack={() => setCurrentView('menu')} />
                );
            case 'circuits':
                 return (
                    <div className="card-bg p-8 rounded-xl shadow-lg text-center animate-fade-in">
                         <button onClick={() => setCurrentView('menu')} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center mb-6">
                            &larr; Volver al menú
                        </button>
                        <div className="flex flex-col items-center justify-center py-12">
                            <FlagIcon className="w-16 h-16 text-gray-500 mb-4" />
                            <h3 className="text-2xl font-orbitron text-white mb-2">Sección Circuitos</h3>
                            <p className="text-gray-400">Aquí se mostrará el calendario y detalles de los circuitos.</p>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="w-full">
            {renderContent()}
        </div>
    );
}

function App() {
    const [motoGpData, setMotoGpData] = useState<MotoGpData | null>(null);
    const [rawCsv, setRawCsv] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Se añade un parámetro a la URL para evitar problemas de caché
            const url = `${SHEET_URL}&_=${new Date().getTime()}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Error al obtener los datos (código ${response.status}).`);
            }
            const text = await response.text();
            setRawCsv(text);
            const data = parseCsvData(text);
            setMotoGpData(data);
        } catch (err: any) {
            setError(err.message || 'Ocurrió un error al procesar los datos.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                // Usamos la variable de entorno BASE_URL de Vite para construir la ruta correcta.
                // Se añade optional chaining y un fallback para entornos donde vite no inyecta las variables.
                const baseUrl = import.meta.env?.BASE_URL ?? '/PorraGP-FULL-2025/';
                const swUrl = `${baseUrl}service-worker.js`;
                navigator.serviceWorker.register(swUrl)
                    .then(registration => {
                        console.log('ServiceWorker registrado correctamente en:', registration.scope);
                    })
                    .catch(err => {
                        console.error('Error en el registro de ServiceWorker:', err);
                    });
            });
        }

    }, [fetchData]);

    const handleSetTab = (tab: Tab) => {
        setActiveTab(tab);
        setIsMenuOpen(false);
    }

    const renderContent = () => {
        // Redirige a la pestaña de Live Timing si se solicita específicamente
        if (activeTab === 'livetiming') {
            return <LiveTimingTab />;
        }
        if (isLoading) {
            return (
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-red-500 mx-auto"></div>
                    <p className="mt-4 text-lg text-gray-300 font-orbitron">Arrancando motores...</p>
                </div>
            );
        }
        if (error) {
            return <p className="text-center text-red-400">{error}</p>;
        }
        if (!motoGpData) {
            return <p className="text-center text-gray-400">No se han podido cargar los datos.</p>;
        }

        switch (activeTab) {
            case 'dashboard':
                return <DashboardTab data={motoGpData} setActiveTab={setActiveTab} />;
            case 'standings':
                return <StandingsTab data={motoGpData} />;
            case 'statistics':
                return <StatisticsTab data={motoGpData} />;
            case 'circuits':
                 return <CircuitsTab data={motoGpData} />;
            case 'participantes':
                 return <ParticipantesTab data={motoGpData} />;
             case 'votar':
                return <VotarTab />;
            case 'noticias':
                return <NewsTab />;
            case 'motogp_data':
                return <MotoGpDataTab data={motoGpData} />;
            default:
                return null;
        }
    };

    return (
        <div className={`min-h-screen w-full flex flex-col ${activeTab !== 'livetiming' ? 'p-4 sm:p-8' : ''}`}>
            <header className={`w-full max-w-7xl mx-auto flex justify-between items-center mb-8 ${activeTab === 'livetiming' ? 'hidden' : ''}`}>
                <button 
                    onClick={() => handleSetTab('dashboard')} 
                    className="group text-2xl sm:text-4xl font-bold font-orbitron text-white text-left focus:outline-none"
                >
                    <span className="transition-colors duration-300 group-hover:motogp-red">Porra</span>
                    <span className="motogp-red transition-colors duration-300 group-hover:text-white">GP</span>
                </button>
                <RefreshButton onClick={fetchData} isLoading={isLoading} />
            </header>

            <main className={`w-full flex-grow flex flex-col ${activeTab !== 'livetiming' ? 'max-w-7xl mx-auto' : ''}`}>
                <div className={`flex justify-between items-center ${activeTab === 'livetiming' ? 'px-4 sm:px-8 py-4' : 'mb-8 border-b border-gray-700'}`}>
                    {/* Mobile Menu Button & Dropdown */}
                    <div className={`sm:hidden relative ${activeTab === 'livetiming' ? 'hidden' : ''}`}>
                        <button onClick={() => setIsMenuOpen(o => !o)} className="p-2 text-gray-400 hover:text-white">
                             <MenuIcon className="w-6 h-6" />
                        </button>
                        {isMenuOpen && (
                            <>
                                {/* Backdrop to close menu on click outside */}
                                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                                <div
                                    className="absolute left-0 mt-2 w-56 origin-top-left rounded-md shadow-lg card-bg ring-1 ring-black ring-opacity-5 z-50"
                                >
                                    <div className="py-1" role="menu" aria-orientation="vertical">
                                        {TABS.map(({name, tab}) => (
                                            <button
                                                key={tab}
                                                onClick={() => handleSetTab(tab)}
                                                className={`${
                                                    activeTab === tab ? 'motogp-red bg-gray-900/50' : 'text-gray-300'
                                                } block w-full text-left px-4 py-4 text-lg hover:bg-gray-700/80 transition-colors`}
                                                role="menuitem"
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Desktop Tabs */}
                    <nav className={`hidden sm:flex -mb-px space-x-6 overflow-x-auto ${activeTab === 'livetiming' ? 'hidden' : ''}`} aria-label="Tabs">
                         {TABS.map(({ name, tab }) => (
                            <TabButton
                                key={tab}
                                name={name}
                                tab={tab}
                                activeTab={activeTab}
                                setActiveTab={handleSetTab}
                            />
                        ))}
                    </nav>
                     {activeTab === 'livetiming' ? (
                        <button
                            onClick={() => handleSetTab('dashboard')}
                            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm whitespace-nowrap"
                        >
                            &larr; Volver
                        </button>
                    ) : (
                        <button
                            onClick={() => setActiveTab('livetiming')}
                            className="motogp-red-bg text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm whitespace-nowrap hover:bg-red-700"
                        >
                            LiveTiming
                        </button>
                    )}
                </div>
                {renderContent()}
            </main>
            
            <footer className={`w-full max-w-7xl mx-auto mt-8 text-center text-xs text-gray-500 flex-shrink-0 ${activeTab === 'livetiming' ? 'hidden' : ''}`}>
                 <p>Versión de compilación: {import.meta.env?.BUILD_TIMESTAMP ?? 'local'}</p>
            </footer>

             <ChatBubbleButton onClick={() => setIsChatOpen(true)} />
            {isChatOpen && motoGpData && (
                <ChatWindow
                    onClose={() => setIsChatOpen(false)}
                    data={motoGpData}
                    rawCsv={rawCsv}
                />
            )}
        </div>
    );
}

export default App;