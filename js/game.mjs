import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import Stats from 'https://unpkg.com/three@0.122.0/examples/jsm/libs/stats.module.js'
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControlsCannon } from './PointerLockControlsCannon.js'

let alvosAcertados = 0;
let camera, scene, renderer, stats
let material

let world
let controls
const timeStep = 1 / 60
let lastCallTime = performance.now() / 1000
let sphereShape
let sphereBody
let physicsMaterial

const balls = []
const ballMeshes = []
const boxes = []  // Adiciona a declaração da lista boxes
const boxMeshes = []; // Adiciona a declaração da lista boxMeshes

initThree()
initCannon()
initPointerLock()
animate()

function initThree() {
    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000)

    // Scene
    scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x7baded, 0, 200)

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(scene.fog.color)

    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    document.body.appendChild(renderer.domElement)

    // Stats.js
    stats = new Stats()

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(10, 30, 20);
    scene.add(directionalLight);

    const spotLight = new THREE.SpotLight(0xff0000, 0.5);
    spotLight.position.set(0, 10, 0);
    spotLight.target.position.set(0, 0, 0);
    spotLight.castShadow = true;
    scene.add(spotLight);

    // Generic material
    material = new THREE.MeshStandardMaterial({ color: 0xdddddd })

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(300, 300, 50, 50);
    floorGeometry.rotateX(-Math.PI / 2);
    const materialFloor = new THREE.MeshStandardMaterial({ color: 0x00dd00 })
    const floor = new THREE.Mesh(floorGeometry);
    floor.receiveShadow = true;
    floor.castShadow = true;
    // scene.add(floor);


    // camera.position.y += 25;
    // camera.position.x += -30;
    // camera.position.z += -50;
    // camera.rotation.y += -Math.PI / 1.25;

    // lensflares
    const textureLoader = new THREE.TextureLoader();

    const textureFlare0 = textureLoader.load('textures/lensflare/lensflare0.png');
    const textureFlare3 = textureLoader.load('textures/lensflare/lensflare3.png');

    // addLight(0.55, 0.9, 0.5, 5000, 0, - 1000);
    addLight(0.39, 1, 0.83, 1000, 800, 100);
    // addLight(0.995, 0.5, 0.9, 5000, 5000, - 1000);

    function addLight(h, s, l, x, y, z) {

        const light = new THREE.PointLight(0xffffff, 1.5, 2000, 0);
        light.color.setHSL(h, s, l);
        light.position.set(x, y, z);
        scene.add(light);

        const lensflare = new Lensflare();
        lensflare.addElement(new LensflareElement(textureFlare0, 1000, 0, light.color));
        lensflare.addElement(new LensflareElement(textureFlare3, 60, 0.6));
        lensflare.addElement(new LensflareElement(textureFlare3, 70, 0.7));
        lensflare.addElement(new LensflareElement(textureFlare3, 120, 0.9));
        lensflare.addElement(new LensflareElement(textureFlare3, 70, 1));
        light.add(lensflare);

    }

    window.addEventListener('resize', onWindowResize)
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
}

function initCannon() {
    // Setup world
    world = new CANNON.World()

    // Tweak contact properties.
    world.defaultContactMaterial.contactEquationStiffness = 1e9
    world.defaultContactMaterial.contactEquationRelaxation = 4

    const solver = new CANNON.GSSolver()
    solver.iterations = 7
    solver.tolerance = 0.1
    world.solver = new CANNON.SplitSolver(solver)

    world.gravity.set(0, -20, 0)

    world.broadphase.useBoundingBoxes = true

    // Create a slippery material
    physicsMaterial = new CANNON.Material('physics')
    const physics_physics = new CANNON.ContactMaterial(physicsMaterial, physicsMaterial, {
        friction: 0.0,
        restitution: 0.3,
    })

    world.addContactMaterial(physics_physics)

    // Create the user collision sphere
    const radius = 1;
    sphereShape = new CANNON.Sphere(radius);
    sphereBody = new CANNON.Body({ mass: 5, material: physicsMaterial });
    sphereBody.addShape(sphereShape);
    sphereBody.position.set(-15, 15, -45);  // Ajuste a posição conforme necessário
    sphereBody.linearDamping = 0.9;
    world.addBody(sphereBody);

    // Create the ground plane
    // const groundShape = new CANNON.Plane()
    // const groundBody = new CANNON.Body({ mass: 0, material: physicsMaterial })
    // groundBody.addShape(groundShape)
    // groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    // world.addBody(groundBody)

    // The shooting balls
    const shootVelocity = 15;
    const ballShape = new CANNON.Sphere(0.2);
    const ballGeometry = new THREE.SphereGeometry(ballShape.radius, 32, 32);

    // Returns a vector pointing to the direction the camera is at
    function getShootDirection() {
        const vector = new THREE.Vector3(0, 0, 1);
        vector.unproject(camera);
        const ray = new THREE.Ray(sphereBody.position, vector.sub(sphereBody.position).normalize());
        return ray.direction;
    }

    window.addEventListener('click', (event) => {
        if (!controls.enabled) {
            return;
        }

        const ballBody = new CANNON.Body({ mass: 1 });

        // Criar um material específico para as bolas disparadas
        const ballMaterial = new CANNON.Material('ballMaterial');


        ballBody.addShape(ballShape, new CANNON.Vec3(), new CANNON.Quaternion(), ballMaterial);
        const materialBall = new THREE.MeshStandardMaterial({ map: new THREE.TextureLoader().load('textures/ball_texture.png') })
        const ballMesh = new THREE.Mesh(ballGeometry, materialBall);
        ballMesh.castShadow = true;
        ballMesh.receiveShadow = true;

        world.addBody(ballBody);
        scene.add(ballMesh);
        balls.push(ballBody);
        ballMeshes.push(ballMesh);

        const shootDirection = getShootDirection();
        ballBody.velocity.set(
            shootDirection.x * shootVelocity,
            shootDirection.y * shootVelocity,
            shootDirection.z * shootVelocity
        );

        // Move the ball outside the player sphere
        const x = sphereBody.position.x + shootDirection.x * (sphereShape.radius * 1.02 + ballShape.radius);
        const y = sphereBody.position.y + shootDirection.y * (sphereShape.radius * 1.02 + ballShape.radius);
        const z = sphereBody.position.z + shootDirection.z * (sphereShape.radius * 1.02 + ballShape.radius);
        ballBody.position.set(x, y, z);
        ballMesh.position.copy(ballBody.position);
    });

    function adicionarAlvo(posX, posY, posZ, rotX, rotY, rotZ) {
        // Tamanho do cilindro
        const raio = 0.7;
        const altura = 1;
        const segments = 32;
        let acertou = false;

        // Criação do corpo do cilindro
        const alvoShape = new CANNON.Cylinder(raio, raio, altura, segments);
        const alvoBody = new CANNON.Body({ mass: 0, material: physicsMaterial });

        // Rotaciona o alvoBody ao detectar a colisão
        const axis = new CANNON.Vec3(1, 0, 0);
        const angle = Math.PI / 2;
        alvoBody.quaternion.setFromAxisAngle(axis, angle);
        alvoBody.addShape(alvoShape);

        // Define a posição do alvo com base nos parâmetros
        alvoBody.position.set(posX, posY, posZ);

        world.addBody(alvoBody);

        // Criação da malha do cilindro
        const alvoGeometry = new THREE.CylinderGeometry(raio, raio, altura, segments);
        const materialAlvo = new THREE.MeshStandardMaterial({ map: new THREE.TextureLoader().load('textures/target_texture.jpg') });  // Cor inicial do alvo
        const alvoMesh = new THREE.Mesh(alvoGeometry, materialAlvo);
        alvoMesh.castShadow = true;
        alvoMesh.receiveShadow = true;

        // Aplica a rotação da malha com base nos parâmetros
        alvoMesh.rotation.set(rotX, rotY, rotZ);

        // Define a posição da malha com base nos parâmetros
        alvoMesh.position.set(posX, posY, posZ);

        scene.add(alvoMesh);

        // Adiciona um ouvinte de evento para o "collide" no corpo do alvo
        alvoBody.addEventListener("collide", function (event) {
            // Verifica se a colisão ocorreu com uma bola (ignorando a esfera da câmera)
            if (event.body.mass > 0) {
                // Colisão com a bola
                materialAlvo.color.set(0xff0000);  // Muda a cor para vermelho
                if (!acertou) {
                    alvosAcertados++;
                    document.getElementById('valorGlobal').innerHTML = alvosAcertados + "/7";
                    acertou = true;
                }

            }
        });
    }

    // Chama a função para adicionar o alvo com posições e rotações específicas
    adicionarAlvo(-12, 11, -32.9, Math.PI / 2, 0, 0);
    adicionarAlvo(-5, 13, -39, Math.PI / 2, 0, 0);
    adicionarAlvo(0.5, 24, -35.5, Math.PI / 2, 0, 0);
    adicionarAlvo(-11, 22.5, -29.5, Math.PI / 2, 0, 0);
    adicionarAlvo(-6, 28.5, -26.5, 0, 0, Math.PI / 2);
    adicionarAlvo(0, 31.5, -25, 0, 0, 0);
    adicionarAlvo(-6.7, 6, -35.5, 0, 0, Math.PI / 2);


    function adicionarParalelepipedo(tamx, tamy, tamz, posX, posY, posZ, cor, opacidade) {
        // Criação do corpo do paralelepípedo
        const paralelepipedoShape = new CANNON.Box(new CANNON.Vec3(tamx / 2, tamy / 2, tamz / 2));
        const paralelepipedoBody = new CANNON.Body({ mass: 0, material: physicsMaterial });
        paralelepipedoBody.addShape(paralelepipedoShape);
        paralelepipedoBody.position.set(posX, posY, posZ);

        // Ajuste da fricção (mude o valor conforme necessário)
        paralelepipedoBody.material.friction = 0.5;

        world.addBody(paralelepipedoBody);

        // Criação da malha do paralelepípedo
        const paralelepipedoGeometry = new THREE.BoxGeometry(tamx, tamy, tamz);
        const materialParalelepipedo = new THREE.MeshPhongMaterial({ color: cor, opacity: opacidade, transparent: true });
        const paralelepipedoMesh = new THREE.Mesh(paralelepipedoGeometry, materialParalelepipedo);
        paralelepipedoMesh.castShadow = true;
        paralelepipedoMesh.receiveShadow = true;
        scene.add(paralelepipedoMesh);
        paralelepipedoMesh.position.set(posX, posY, posZ);

        // Adiciona o corpo e a malha à lista de paralelepípedos
        boxes.push(paralelepipedoBody);
        boxMeshes.push(paralelepipedoMesh);
    }

    adicionarParalelepipedo(5, 2, 5, -15, 10, -46, 0xe6e6e8, 1);

    adicionarParalelepipedo(2.5, 0.5, 2.5, -12, 11, -38, 0xe6e6e8, 1);
    adicionarParalelepipedo(1.5, 0.5, 1.5, -13, 14, -35, 0x787959, 1);
    adicionarParalelepipedo(1.5, 0.5, 1.5, -10, 16, -35, 0x787959, 1);
    adicionarParalelepipedo(1.5, 0.5, 1.5, -10, 22, -35, 0x787959, 1);
    adicionarParalelepipedo(1.5, 0.5, 1.5, -9, 27, -32, 0x787959, 1);
    adicionarParalelepipedo(20, 10, 0.01, 0, 2, -6, 0x8ac6ff, 1);

    adicionarParalelepipedo(5, 20, 20, -4, 4.5, -29, 0xdd0000, 0);
    adicionarParalelepipedo(3, 32, 18, -4, 4.5, -29, 0xdd0000, 0);
    adicionarParalelepipedo(7, 42, 14, 2, 4.5, -29, 0x00dd00, 0);
    adicionarParalelepipedo(8, 32, 18, 1, 5.5, -28, 0xdd0000, 0);
    adicionarParalelepipedo(10, 32, 18, 0, 7.5, -25, 0xdd0000, 0);
    //centro
    adicionarParalelepipedo(11, 63, 14, -1, -0.5, -25, 0xdd0000, 0);
    //direito
    adicionarParalelepipedo(3, 32, 4, -9, 13, -24, 0xdd0000, 0);
    adicionarParalelepipedo(15, 52, 4, -5, -1, -28, 0xdd0000, 0);
    adicionarParalelepipedo(6, 52, 6, -12, -5.5, -29.5, 0xdd0000, 0);



    function adicionarModeloGLB(caminho, posX, posY, posZ, opacidade) {
        const loader = new GLTFLoader();

        loader.load(caminho, (gltf) => {
            const modelo = gltf.scene;

            modelo.position.set(posX, posY, posZ);

            // Adapte o tamanho do modelo conforme necessário
            modelo.scale.set(10, 10, 10);

            // Adicione o modelo à cena
            scene.add(modelo);

            // Adapte o corpo do modelo de física conforme necessário
            const modeloBody = new CANNON.Body({ mass: 0, material: physicsMaterial });
            // modeloBody.addShape(new CANNON.Box(new CANNON.Vec3(1, 1, 1))); // Substitua pela forma correta
            const result = threeToCannon(modelo, { type: ShapeType.BOX });
            const { shape, offset, quaternion } = result;
            modeloBody.addShape(shape, offset, orientation);
            modeloBody.position.set(posX, posY, posZ);
            world.addBody(modeloBody);

            // Ajuste da opacidade do material do modelo
            modelo.traverse((obj) => {
                if (obj.isMesh) {
                    obj.material.transparent = true;
                    obj.material.opacity = opacidade;
                }
            });

        }, undefined, (error) => {
            console.error('Erro ao carregar o modelo GLB', error);
        });
    }

    function adicionarModeloGLBBasquete(caminho, posX, posY, posZ, opacidade) {
        const loader = new GLTFLoader();

        loader.load(caminho, (gltf) => {
            const modelo = gltf.scene;

            modelo.position.set(posX, posY, posZ);

            // Adapte o tamanho do modelo conforme necessário
            modelo.scale.set(1, 1, 1);

            // Adicione o modelo à cena
            scene.add(modelo);

            // Adapte o corpo do modelo de física conforme necessário
            const modeloBody = new CANNON.Body({ mass: 0, material: physicsMaterial });
            // modeloBody.addShape(new CANNON.Box(new CANNON.Vec3(1, 1, 1))); // Substitua pela forma correta
            const result = threeToCannon(modelo, { type: ShapeType.BOX });
            const { shape, offset, quaternion } = result;
            modeloBody.addShape(shape, offset, orientation);
            modeloBody.rotateY(Math.PI / 2);
            // modeloBody.rotation.set(Math.PI/2, 0, 0);
            world.addBody(modeloBody);

            // Ajuste da opacidade do material do modelo
            modelo.traverse((obj) => {
                if (obj.isMesh) {
                    obj.material.transparent = true;
                    obj.material.opacity = opacidade;
                }
            });

        }, undefined, (error) => {
            console.error('Erro ao carregar o modelo GLB', error);
        });
    }

    adicionarModeloGLB('models/peaceful_mountain_village.glb', 0, 25, -25, 0.5);
    adicionarModeloGLBBasquete('models/basketball_hoop.glb', -22, 6.5, -46, 0.5);
    adicionarParalelepipedo(3, 3, 3, -23, 12, -46, 0xdd0000, 0);
    adicionarParalelepipedo(2, 1, 2, -24, 6, -46, 0xe6e6e8, 1);
}

function initPointerLock() {
    controls = new PointerLockControlsCannon(camera, sphereBody)
    scene.add(controls.getObject())

    instructions.addEventListener('click', () => {
        controls.lock()
    })

    controls.addEventListener('lock', () => {
        controls.enabled = true
        instructions.style.display = 'none'
    })

    controls.addEventListener('unlock', () => {
        controls.enabled = false
        instructions.style.display = null
    })


    function shootSphere() {
        if (!controls.enabled) {
            return;
        }

        const sphereRadius = 0.2; // Raio da esfera
        const shootVelocity = 15; // Velocidade de disparo

        // Criação do corpo da esfera
        const sphereBody = new CANNON.Body({ mass: 1 });
        sphereBody.addShape(new CANNON.Sphere(sphereRadius));

        // Criação da malha da esfera
        const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 32, 32);
        const sphereMesh = new THREE.Mesh(sphereGeometry, new THREE.MeshStandardMaterial({ map: new THREE.TextureLoader().load('ball_texture.png') }));

        // Configuração de propriedades de sombra
        sphereMesh.castShadow = true;
        sphereMesh.receiveShadow = true;

        // Determina a direção de tiro
        const shootDirection = getShootDirection();

        // Define a posição inicial da esfera fora do jogador
        const startPosition = sphereBody.position.clone();
        startPosition.vaddScaledVector(shootDirection, sphereShape.radius * 1.02 + sphereRadius);

        sphereBody.position.copy(startPosition);
        sphereMesh.position.copy(startPosition);

        // Define a velocidade da esfera
        sphereBody.velocity.set(
            shootDirection.x * shootVelocity,
            shootDirection.y * shootVelocity,
            shootDirection.z * shootVelocity
        );

        // Adiciona a esfera ao mundo e à cena
        world.addBody(sphereBody);
        scene.add(sphereMesh);

        // Armazena o corpo e a malha nas arrays correspondentes
        balls.push(sphereBody);
        ballMeshes.push(sphereMesh);
    }

    // Adiciona um ouvinte de eventos para o clique do mouse
    document.addEventListener('click', () => {
        shootSphere();
    });


}

function animate() {
    requestAnimationFrame(animate)

    const time = performance.now() / 1000
    const dt = time - lastCallTime
    lastCallTime = time

    if (controls.enabled) {
        world.step(timeStep, dt)

        // Update ball positions
        for (let i = 0; i < balls.length; i++) {
            ballMeshes[i].position.copy(balls[i].position)
            ballMeshes[i].quaternion.copy(balls[i].quaternion)
        }

        // Update box positions
        for (let i = 0; i < boxes.length; i++) {
            boxMeshes[i].position.copy(boxes[i].position)
            boxMeshes[i].quaternion.copy(boxes[i].quaternion)
        }
    }

    if (sphereBody.position.y <= -5) {
        sphereBody.position.set(-15, 15, -45);
        alert("Você caiu para fora do mundo :(");
    }

    if (alvosAcertados == 7) {
        alvosAcertados = 0;
        alert("Parabéns! você chegou ao topo e acertou tudo :)");
        location.reload()
    }

    controls.update(dt)
    renderer.render(scene, camera)
    stats.update()
}
