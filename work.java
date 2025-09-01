import java.util.Scanner;
public class work {

    public static void main(String[] args) {
        
        Scanner scan = new Scanner(System.in);

        int[] arr = new int[7];
        arr[0] = 3;

        //input using a for loop 
        for(int i = 0; i < arr.length; i++){
            arr[i] = scan.nextInt();
        }

        for(int i = 0; i < arr.length; i++){
            System.out.println(arr[i]);
        }

    }
}