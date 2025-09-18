# 🌐 Networking & Exposure Spec (Agones + Nakama + atlas-world-svc)

## 🎯 Goal
Expose `atlas-world-svc` game pods so **internet clients** can connect to the **correct allocated instance**, with low latency and safe routing.

---

## 🔑 Roles
- **atlas-world-svc** = authoritative simulator (pods).
- **Agones** = lifecycle + allocation (starts/stops pods, assigns IP:port).
- **Nakama** = matchmaking/auth; calls Agones Allocation, returns endpoint + signed token.
- **Client** = connects directly to `ip:port` from Nakama.

---

## ✅ Recommended Exposure Modes

### **HostPort (preferred)**
- Each pod binds a **hostPort** on node’s external/public IP.  
- Client connects directly: `nodePublicIP:hostPort`.  
- **Pros:** lowest latency, simplest.  
- **Cons:** need to reserve/open a port range in firewall.  

```yaml
ports:
- name: game
  portPolicy: HostPort
  containerPort: 7350
  hostPort: 7350
  protocol: TCP # or UDP
```

---

### **NodePort (fallback)**
- Each pod gets a **NodePort** (30000–32767 by default).  
- Client connects: `nodePublicIP:nodePort`.  
- **Pros:** cloud-managed, flexible.  
- **Cons:** still requires opening NodePort range in firewall.  

```yaml
ports:
- name: game
  portPolicy: Dynamic
  containerPort: 7350
  protocol: TCP
```

---

### **Gateway/Proxy (last resort)**
- Run a WS/L4 proxy on `:443` (Envoy/HAProxy/custom gateway).  
- Clients connect `wss://game.example.com`; proxy routes internally to the right `atlas-world-svc` pod.  
- **Pros:** firewall-friendly (443 only).  
- **Cons:** extra hop, latency, complexity.  

---

## ❌ Not recommended
- **ContainerPort only**: pods are internal-only, unreachable from the internet unless proxied.  
- **Generic HTTP LB**: not viable, can’t route to the correct match instance.

---

## 🔒 Security
- Clients never guess endpoints.  
- Nakama issues `{ ip, port, token }` only after Agones allocation.  
- **Token** = signed JWT/HMAC containing `userId`, `mapKey`, `instanceId`, `exp`.  
- `atlas-world-svc` verifies token before admitting connection.

---

## 📊 Operational Notes
- **Firewall:** reserve a small port range (e.g. 7300–7399) per region.  
- **Scaling:** FleetAutoscaler keeps a buffer of Ready servers (e.g. 5).  
- **Metrics:** log failed connects by `exposureMode`.  
- **Fallback:** if HostPort not allowed, use NodePort; only proxy if `:443` constraint exists.  

---

## ⚖️ Decision Table

| Scenario | Mode |
|----------|------|
| Public nodes, can open port range | **HostPort** ✅ |
| Public nodes, prefer K8s-managed ports | **NodePort** ✅ |
| Strict firewall, 443 only | **Gateway/Proxy** ⚠️ |
| Internal playtest / VPC only | **ContainerPort** |
