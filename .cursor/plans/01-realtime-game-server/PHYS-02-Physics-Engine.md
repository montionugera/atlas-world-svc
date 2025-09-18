# ⚡ PHYS-02: Physics Engine Implementation

## 🎯 Epic Goal
Implement Planck.js physics world per floor with collision detection and movement simulation.

## ✅ Checklist

### Phase 2.1: Physics World Setup 🚧
- [ ] Create PlanckWorldManager class
- [ ] Implement per-floor physics worlds
- [ ] Setup physics configuration (60Hz sub-steps)
- [ ] Add world stepping with fixed timestep

### Phase 2.2: Body Factories ⏳
- [ ] Player body factory (circles, 0.5m radius)
- [ ] Monster body factory (circles/boxes)
- [ ] Static collider factory from JSON data
- [ ] Body cleanup and pooling system

### Phase 2.3: Collision System ⏳
- [ ] Player-world collision detection
- [ ] Player-player collision handling
- [ ] Monster-player collision events
- [ ] Collision filtering by layers

### Phase 2.4: Movement Integration ⏳
- [ ] Input velocity application
- [ ] Physics body synchronization
- [ ] Position interpolation
- [ ] Velocity capping and validation

### Phase 2.5: World Loading ⏳
- [ ] JSON collider parsing
- [ ] Shape creation (boxes, circles, polygons)
- [ ] Layer mask assignment
- [ ] World validation and hashing

## 🏗️ Technical Requirements
- Planck.js 0.3.x
- 60Hz physics simulation
- Fixed timestep stepping
- Object pooling for bodies

## 📊 Acceptance Criteria
- [ ] Physics worlds create per floor
- [ ] Colliders load from JSON correctly
- [ ] Player movement simulates accurately
- [ ] No physics tunneling at high speeds
