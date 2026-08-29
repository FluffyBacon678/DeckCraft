import java.nio.channels.Selector;
public class NioProbe { public static void main(String[] a) throws Exception {
    Selector.open().close(); System.out.println(\"Selector.open() OK\"); } }
