import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { chatWithData } from './services/geminiService';
import { fetchSeasons, fetchRidersBySeason, fetchRiderDetails, fetchLiveTiming, fetchRiderStats, fetchRiderSeasonStats, fetchResultCategories, fetchResultEvents, fetchResultSessions, fetchSessionClassification, fetchAllRiders, fetchBroadcastEvents } from './services/motogpApiService';
import type { MotoGpData, Race, PlayerScore, PlayerVote, DriverVoteCount, ChatMessage, RaceResult, CircuitResult, Article, ApiSeason, ApiRider, LiveTimingHead, RiderStats, RiderSeasonStat, ApiCategoryResult, ApiEventResult, ApiSessionResult, ApiClassificationItem, ApiBroadcastEvent } from './types';
import { TrophyIcon, TableIcon, SparklesIcon, SendIcon, RefreshIcon, FlagIcon, UserIcon, PencilSquareIcon, MenuIcon, XIcon, NewspaperIcon, AppleIcon, AndroidIcon, IosShareIcon, AddToScreenIcon, AppleAppStoreBadge, GooglePlayBadge, CameraIcon, ShareIcon, DownloadIcon, FullscreenIcon, FullscreenExitIcon, SearchIcon } from './components/icons';

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
    { name: "Estadísticas Porra", tab: "statistics" },
    { name: "Votos pilotos", tab: "participantes" },
    { name: "MotoGP Data", tab: "motogp_data" },
    { name: "Noticias MotoGP", tab: "noticias" },
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
            <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin'