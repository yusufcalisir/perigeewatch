import {
    Entity,
    Cartesian3,
    Color,
    Transforms,
    Quaternion,
    Matrix3,
    Matrix4,
    Math as CesiumMath,
    JulianDate,
    CallbackProperty
} from 'cesium';

/**
 * Creates a high-fidelity procedural 3D model for specific satellites
 * using standard Cesium primitives (Boxes, Cylinders) combined into an Entity.
 */
export const createSatelliteModel = (viewer: any, noradId: number, position: Cartesian3, orientation: Quaternion) => {
    const id = `model-${noradId}`;
    viewer.entities.removeById(id);

    // ISS (International Space Station)
    if (noradId === 25544) {
        const entity = viewer.entities.add({
            id: id,
            position: position,
            orientation: orientation,
            model: {
                uri: '/models/iss_placeholder.glb', // Fallback if exists
                minimumPixelSize: 128,
                maximumScale: 20000,
                show: false // We will use manual primitives until we have a GLB
            }
        });

        // Since we don't have a GLB, we construct a "LEGO" style ISS
        // Note: Cesium Entities are single-graphic. To make a composite, we need multiple entities relative to a parent.
        // Or we use specific ModelGraphics if we CAN generate a GLB on the fly (too hard).
        // Alternative: Return a list of entities that form the shape.

        return createProceduralISS(viewer, position, orientation);
    }

    // Hubble Space Telescope
    if (noradId === 20580) {
        return createProceduralHubble(viewer, position, orientation);
    }

    // Starlink (Generic)
    if (noradId > 40000 && noradId < 99999) { // Rough check for Starlink constellation IDs or we check name
        // We'll handle this in the viewer by checking name
    }

    return null;
};

/**
 * Procedurally generates the ISS structure using multiple entities linked to a parent.
 */
export const createProceduralISS = (viewer: any, position: Cartesian3, orientation: Quaternion) => {
    const parentId = 'iss-anchor';
    viewer.entities.removeById(parentId);

    // Parent Entity (The center of mass)
    const parent = viewer.entities.add({
        id: parentId,
        position: position,
        orientation: orientation,
        point: { pixelSize: 0 } // Invisible anchor
    });

    // Main Truss (Long horizontal beam)
    // Dimensions: ~100m wide
    // We can't easily attach child entities with relative offsets in pure Cesium Entity API without CZML or a custom mechanism.
    // However, we can use `CallbackProperty` to calculate positions relative to the parent every frame.
    // This is expensive for many objects but fine for just the ISS.

    // Actually, Cesium doesn't support "child entities" with rigid body transforms natively and easily in the Entity API
    // without using the Model class or complex callbacks.

    // QUICK FIX:
    // We will use a glTF model if possible. Since we can't generate one, we will use a single massive BILLBOARD
    // that is a high-res render of the ISS? No, user wants 3D.

    // Let's use the 'BoxGraphics' with a CallbackProperty for position/orientation relative to parent?
    // Too complex.

    // Alternative: Just render ONE main shape that approximates it.
    // ISS = A big Plus sign/Rectangle.

    // Let's try to define a 'ModelGraphics' that points to a generic shape if available.
    // Since we failed to generate images or models, we are stuck with internal primitives.

    // OK, "Low-Poly" Procedural ISS using one Entity with a Box (Truss) and... we can only have one shape per entity.
    // So we need multiple entities.

    // We will spawn 3 entities:
    // 1. Solar Array Left
    // 2. Solar Array Right
    // 3. Central Modules

    const entities: any[] = [];

    // Helper to add parts
    const addPart = (name: string, offset: Cartesian3, dimensions: Cartesian3, color: Color) => {
        // We need a CallbackProperty to update position based on parent's position + rotation
        const updatePos = new CallbackProperty((time: any, result: any) => {
            const pPos = parent.position.getValue(time);
            const pOri = parent.orientation.getValue(time);
            if (!pPos || !pOri) return pPos;

            // Rotate offset by orientation
            const m3 = Matrix3.fromQuaternion(pOri);
            const rotatedOffset = Matrix3.multiplyByVector(m3, offset, new Cartesian3());
            return Cartesian3.add(pPos, rotatedOffset, result);
        }, false);

        const e = viewer.entities.add({
            position: updatePos,
            orientation: orientation, // Keep same orientation
            box: {
                dimensions: dimensions,
                material: color,
                outline: true,
                outlineColor: Color.WHITE.withAlpha(0.2)
            }
        });
        entities.push(e);
    };

    // Central Modules (Cylindrical-ish -> Box approximation)
    // 20m x 5m x 5m
    addPart('iss-modules', new Cartesian3(0, 0, 0), new Cartesian3(10, 10, 40), Color.SILVER);

    // Truss (Perpendicular)
    // 100m x 2m x 2m
    addPart('iss-truss', new Cartesian3(0, 0, 0), new Cartesian3(80, 2, 2), Color.GRAY);

    // Solar Arrays (Blue panels at ends of truss)
    // Left
    addPart('iss-solar-L1', new Cartesian3(30, 10, 0), new Cartesian3(10, 30, 0.5), Color.fromCssColorString('#1a2b4b'));
    addPart('iss-solar-L2', new Cartesian3(30, -10, 0), new Cartesian3(10, 30, 0.5), Color.fromCssColorString('#1a2b4b'));

    // Right
    addPart('iss-solar-R1', new Cartesian3(-30, 10, 0), new Cartesian3(10, 30, 0.5), Color.fromCssColorString('#1a2b4b'));
    addPart('iss-solar-R2', new Cartesian3(-30, -10, 0), new Cartesian3(10, 30, 0.5), Color.fromCssColorString('#1a2b4b'));

    // IMPORTANT: Return parent as well so it can be cleaned up
    return [parent, ...entities];
};


export const createProceduralHubble = (viewer: any, position: Cartesian3, orientation: Quaternion) => {
    const parentId = 'hubble-anchor';
    viewer.entities.removeById(parentId);

    const parent = viewer.entities.add({
        id: parentId,
        position: position,
        orientation: orientation,
        point: { pixelSize: 0 }
    });

    const entities: any[] = [];

    const addPart = (offset: Cartesian3, shape: any) => {
        const updatePos = new CallbackProperty((time: any, result: any) => {
            // Safety check: if parent is destroyed or not ready
            if (!parent || !parent.position) return undefined;

            const pPos = parent.position.getValue(time);
            const pOri = parent.orientation.getValue(time);
            if (!pPos || !pOri) return pPos;
            const m3 = Matrix3.fromQuaternion(pOri);
            const rotatedOffset = Matrix3.multiplyByVector(m3, offset, new Cartesian3());
            return Cartesian3.add(pPos, rotatedOffset, result);
        }, false);

        const e = viewer.entities.add({
            position: updatePos,
            orientation: orientation,
            ...shape
        });
        entities.push(e);
    };

    // Main Tube (Cylinder)
    addPart(new Cartesian3(0, 0, 0), {
        cylinder: {
            length: 13.0,
            topRadius: 2.1,
            bottomRadius: 2.1,
            material: Color.SILVER,
        }
    });

    // Solar Panels
    addPart(new Cartesian3(0, 4, 0), {
        box: { dimensions: new Cartesian3(2.5, 7, 0.1), material: Color.BLUE }
    });
    addPart(new Cartesian3(0, -4, 0), {
        box: { dimensions: new Cartesian3(2.5, 7, 0.1), material: Color.BLUE }
    });

    return [parent, ...entities];
};

export const createProceduralStarlink = (viewer: any, position: Cartesian3, orientation: Quaternion, idStr: string) => {
    // Starlink is simple: Flat chassis + 1 big panel
    // Chassis: 3m x 1.5m x 0.2m
    // Panel: 8m x 3m (extends upwards)

    // We just return one entity with a Box that looks like the chassis, 
    // and maybe we assume the panel is folded or we just model it as a flat plate.

    // Actually, let's just make it a cool cyan box with a trail.
    const entity = viewer.entities.add({
        id: idStr,
        position: position,
        orientation: orientation,
        box: {
            dimensions: new Cartesian3(4.0, 1.5, 0.2), // Flat
            material: Color.fromCssColorString('#202020'),
            outline: true,
            outlineColor: Color.CYAN
        }
    });
    return [entity];
};
