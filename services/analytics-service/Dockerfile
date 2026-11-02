# Build context: repo root (see docker-compose.dev.yml)
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY services/analytics-service/pom.xml pom.xml
RUN mvn -q -B dependency:go-offline
COPY services/analytics-service/src src
RUN mvn -q -B package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /build/target/*.jar app.jar
EXPOSE 8081
# H2 file DB lives in /app/data, shared between Java services via a volume
CMD ["java", "-jar", "app.jar"]
