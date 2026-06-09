import React, { useState, useEffect } from 'react';
import { MdDragHandle } from 'react-icons/md';
import { FiTrash2 } from 'react-icons/fi';

/**
 * ManualSeedingAssignment Component
 * Allows administrators to manually assign seed positions to players via dragging or input
 *
 * Props:
 * - players: Array of players available to seed
 * - manualSeedOrder: Current seed order (array of player objects with position)
 * - onUpdate: Callback function when seed order changes
 * - allowDragReorder: Enable drag-to-reorder (default: true)
 */
export default function ManualSeedingAssignment({
  players = [],
  manualSeedOrder = [],
  onUpdate,
  allowDragReorder = true
}) {
  const [seedList, setSeedList] = useState([]);
  const [unassignedPlayers, setUnassignedPlayers] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null);
  const [errors, setErrors] = useState([]);

  // Initialize seedList from manualSeedOrder
  useEffect(() => {
    if (!manualSeedOrder || manualSeedOrder.length === 0) {
      setSeedList(
        (players || []).map((player, idx) => ({
          ...player,
          seedPosition: idx + 1,
        }))
      );
      setUnassignedPlayers([]);
    } else {
      setSeedList(manualSeedOrder);
      const assignedIds = new Set(manualSeedOrder.map((p) => p.id));
      setUnassignedPlayers(
        (players || []).filter((p) => !assignedIds.has(p.id))
      );
    }
  }, [players, manualSeedOrder]);

  // Validate for duplicates and missing positions
  const validateSeeding = (list) => {
    const newErrors = [];

    // Check for duplicate positions
    const positions = list.map((p) => p.seedPosition).filter((p) => p !== undefined);
    const uniquePositions = new Set(positions);
    if (positions.length !== uniquePositions.size) {
      newErrors.push('❌ Duplicate seed positions detected');
    }

    // Check for gaps in positions (if all players assigned)
    if (list.length === players.length) {
      const sortedPositions = positions.sort((a, b) => a - b);
      for (let i = 1; i <= list.length; i++) {
        if (!sortedPositions.includes(i)) {
          newErrors.push(`❌ Missing position ${i}`);
        }
      }
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  // Handle position input change
  const handlePositionChange = (playerId, newPosition) => {
    const updated = seedList.map((p) =>
      p.id === playerId ? { ...p, seedPosition: newPosition ? parseInt(newPosition) : undefined } : p
    );
    setSeedList(updated);
    validateSeeding(updated);
    if (onUpdate) onUpdate(updated);
  };

  // Handle drag start
  const handleDragStart = (index) => {
    if (!allowDragReorder) return;
    setDraggedItem(index);
  };

  // Handle drag over
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Handle drop
  const handleDrop = (index) => {
    if (!allowDragReorder || draggedItem === null) return;

    const updated = [...seedList];
    const [draggedPlayer] = updated.splice(draggedItem, 1);
    updated.splice(index, 0, draggedPlayer);

    // Re-assign positions based on new order
    updated.forEach((p, idx) => {
      p.seedPosition = idx + 1;
    });

    setSeedList(updated);
    setDraggedItem(null);
    validateSeeding(updated);
    if (onUpdate) onUpdate(updated);
  };

  // Remove player from seeding
  const handleRemoveFromSeeding = (playerId) => {
    const player = seedList.find((p) => p.id === playerId);
    if (player) {
      const updated = seedList.filter((p) => p.id !== playerId);
      setSeedList(updated);
      setUnassignedPlayers([...unassignedPlayers, player]);
      validateSeeding(updated);
      if (onUpdate) onUpdate(updated);
    }
  };

  // Add player to seeding
  const handleAddToSeeding = (playerId) => {
    const player = unassignedPlayers.find((p) => p.id === playerId);
    if (player) {
      const nextPosition = (seedList.length || 0) + 1;
      const updated = [...seedList, { ...player, seedPosition: nextPosition }];
      setSeedList(updated);
      setUnassignedPlayers(unassignedPlayers.filter((p) => p.id !== playerId));
      validateSeeding(updated);
      if (onUpdate) onUpdate(updated);
    }
  };

  const allPlayersAssigned = unassignedPlayers.length === 0;
  const isValid = errors.length === 0 && allPlayersAssigned;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      <div className="border-b pb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Manual Seeding Assignment</h3>
        <p className="text-sm text-gray-600">
          Drag to reorder or manually enter seed positions (1 = strongest seed)
        </p>
      </div>

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="font-semibold text-red-800 mb-2">Validation Issues:</div>
          <ul className="space-y-1">
            {errors.map((error, idx) => (
              <li key={idx} className="text-red-700 text-sm">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Status Badge */}
      {allPlayersAssigned && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-green-800 text-sm font-medium">
            ✅ All {seedList.length} players assigned to seed positions
          </p>
        </div>
      )}

      {/* Assigned Players (Seeding List) */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-3">
          🏆 Seed Positions ({seedList.length} assigned)
        </label>
        <p className="text-xs text-gray-600 mb-3 pl-3 border-l-2 border-blue-400">
          Position <span className="font-semibold text-blue-600">#1</span> = Strongest seed | Higher numbers = Lower seeds
        </p>
        <div className="space-y-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
          {seedList.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No players assigned yet</p>
          ) : (
            seedList.map((player, index) => (
              <div
                key={player.id}
                draggable={allowDragReorder}
                onDragStart={() => handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
                className={`flex items-center gap-4 p-3 bg-white border border-gray-300 rounded-lg cursor-move transition ${
                  draggedItem === index ? 'opacity-50 bg-gray-100' : ''
                } hover:shadow-sm`}
              >
                {/* Drag Handle */}
                {allowDragReorder && (
                  <div className="text-gray-400 flex-shrink-0">
                    <MdDragHandle size={18} />
                  </div>
                )}

                {/* Seed Position Badge */}
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center border-2 border-blue-700 shadow-md">
                    <span className="text-lg font-bold text-white">
                      {player.seedPosition || '-'}
                    </span>
                  </div>
                </div>

                {/* Player Info */}
                <div className="flex-grow">
                  <p className="text-sm font-medium text-gray-900">
                    {player.firstName} {player.lastName}
                  </p>
                  {player.ranking && (
                    <p className="text-xs text-gray-500">Rank: {player.ranking}</p>
                  )}
                </div>

                {/* Seed Position Input (Hidden, but kept for functionality) */}
                <div className="flex-shrink-0 w-16 hidden">
                  <input
                    type="number"
                    min="1"
                    max={players.length}
                    value={player.seedPosition || ''}
                    onChange={(e) => handlePositionChange(player.id, e.target.value)}
                    className="w-full px-2 py-1 text-center border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Pos"
                  />
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => handleRemoveFromSeeding(player.id)}
                  className="flex-shrink-0 p-2 text-red-600 hover:bg-red-50 rounded transition"
                  title="Remove from seeding"
                >
                  <FiTrash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Unassigned Players */}
      {unassignedPlayers.length > 0 && (
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-3">
            Unassigned Players ({unassignedPlayers.length})
          </label>
          <div className="space-y-2 bg-yellow-50 rounded-lg p-3 border border-yellow-200">
            {unassignedPlayers.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between p-3 bg-white border border-yellow-300 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {player.firstName} {player.lastName}
                  </p>
                  {player.ranking && (
                    <p className="text-xs text-gray-500">Rank: {player.ranking}</p>
                  )}
                </div>
                <button
                  onClick={() => handleAddToSeeding(player.id)}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">{seedList.length}</span> of{' '}
          <span className="font-semibold">{players.length}</span> players assigned
          {isValid && <span className="ml-2 text-green-700">✓ Ready</span>}
        </p>
      </div>
    </div>
  );
}
